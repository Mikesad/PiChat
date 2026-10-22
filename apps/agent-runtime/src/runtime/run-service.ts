import { join } from "node:path";
import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { RAGFlowClient } from "@pichat/ragflow-client";
import type {
  ChatErrorPayload,
  ChatRunRequest,
  InternalPrincipal,
  TypedSseEvent,
} from "@pichat/shared";
import { type AccessClient, AccessClientError } from "../clients/access-client.js";
import type { RuntimeConfig } from "../config.js";
import { createKbReadTool } from "../tools/kb-read.js";
import { createKbSearchTool } from "../tools/kb-search.js";
import { type KbToolDetails, ToolExecutionError } from "../tools/types.js";
import { createRunModel, type RunModel } from "./model.js";
import { RunState } from "./run-state.js";
import { openPiSession } from "./session-store.js";
import { PIChatSystemPrompt } from "./system-prompt.js";
import { toolPolicyExtension } from "./tool-policy.js";

export interface RunLogger {
  info(payload: Record<string, unknown>, message?: string): void;
  error(payload: Record<string, unknown>, message?: string): void;
}

interface ActiveRun {
  controller: AbortController;
  sessionId: string;
  principal: InternalPrincipal;
}

export interface RunEventSink {
  readonly isClosed: boolean;
  send(event: TypedSseEvent): void;
  end(): void;
}

export type CreateRunModel = (
  input: ChatRunRequest["model"],
  config: RuntimeConfig,
) => Promise<RunModel>;

export interface RunServiceDependencies {
  config: RuntimeConfig;
  accessClient: AccessClient;
  ragflow: RAGFlowClient | null;
  logger: RunLogger;
  createModel?: CreateRunModel;
}

export class RunService {
  private readonly runs = new Map<string, ActiveRun>();
  private readonly busySessions = new Set<string>();
  private readonly createModel: CreateRunModel;

  constructor(private readonly deps: RunServiceDependencies) {
    this.createModel = deps.createModel ?? createRunModel;
  }

  isSessionBusy(sessionId: string): boolean {
    return this.busySessions.has(sessionId);
  }

  hasRun(runId: string): boolean {
    return this.runs.has(runId);
  }

  abort(runId: string): boolean {
    const run = this.runs.get(runId);
    if (!run) {
      return false;
    }
    run.controller.abort();
    return true;
  }

  async run(input: ChatRunRequest, writer: RunEventSink): Promise<void> {
    if (this.runs.has(input.runId)) {
      throw new ToolExecutionError("duplicate_run", "同一运行 ID 已存在");
    }
    if (this.busySessions.has(input.sessionId)) {
      throw new ToolExecutionError("session_busy", "该会话正在生成回答");
    }

    const controller = new AbortController();
    this.runs.set(input.runId, {
      controller,
      sessionId: input.sessionId,
      principal: input.principal,
    });
    this.busySessions.add(input.sessionId);

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.deps.config.runTimeoutMs);
    timeout.unref();

    const state = new RunState(input.runId, input.sessionId, input.assistantMessageId);
    let session: AgentSession | undefined;
    let runModel: Awaited<ReturnType<typeof createRunModel>> | undefined;
    let abortSession: (() => void) | undefined;
    let citationQueue: Promise<void> = Promise.resolve();
    const emittedCitations = new Set<string>();

    try {
      writer.send({
        type: "run.start",
        data: {
          runId: input.runId,
          sessionId: input.sessionId,
          assistantMessageId: input.assistantMessageId,
          model: {
            provider: input.model.provider,
            modelId: input.model.modelId,
            displayName: input.model.displayName,
          },
        },
      });

      const opened = await openPiSession({
        dataDir: this.deps.config.dataDir,
        principal: input.principal,
        sessionId: input.sessionId,
        history: input.history,
      });

      runModel = await this.createModel(input.model, this.deps.config);

      const resourceLoader = new DefaultResourceLoader({
        cwd: opened.workspace,
        agentDir: join(opened.workspace, ".pi"),
        noExtensions: true,
        noSkills: true,
        noContextFiles: true,
        extensionFactories: [toolPolicyExtension],
        systemPromptOverride: () => PIChatSystemPrompt,
      });
      await resourceLoader.reload();

      const toolContext = {
        principal: input.principal,
        accessClient: this.deps.accessClient,
        ragflow: this.deps.ragflow,
        citations: state.citations,
        config: this.deps.config,
      };

      const created = await createAgentSession({
        cwd: opened.workspace,
        agentDir: join(opened.workspace, ".pi"),
        modelRuntime: runModel.runtime,
        model: runModel.model,
        thinkingLevel: input.thinkingLevel,
        noTools: "all",
        tools: ["kb_search", "kb_read"],
        customTools: [createKbSearchTool(toolContext), createKbReadTool(toolContext)],
        resourceLoader,
        settingsManager: SettingsManager.inMemory(),
        sessionManager: opened.sessionManager,
        sessionStartEvent: { type: "session_start", reason: opened.restored ? "resume" : "new" },
      });
      session = created.session;
      session.setActiveToolsByName(["kb_search", "kb_read"]);
      await session.bindExtensions({ abortHandler: () => controller.abort() });

      abortSession = () => {
        if (session) {
          void session.abort().catch(() => {});
        }
      };
      controller.signal.addEventListener("abort", abortSession, { once: true });
      if (controller.signal.aborted) {
        abortSession();
      }

      const emitCitation = (citation: KbToolDetails["citations"][number]) => {
        citationQueue = citationQueue.then(async () => {
          if (emittedCitations.has(citation.id) || writer.isClosed) {
            return;
          }
          try {
            const result = await this.deps.accessClient.check(input.principal, citation.documentId);
            if (!result.allowed) {
              state.citations.remove(citation.documentId);
              return;
            }
            emittedCitations.add(citation.id);
            writer.send({ type: "citation.add", data: citation });
          } catch {
            state.citations.remove(citation.documentId);
          }
        });
      };

      session.subscribe((event) => {
        this.handleEvent(event, input, state, writer, emitCitation);
      });

      if (!controller.signal.aborted) {
        await session.prompt(input.prompt, { source: "extension" });
        await session.waitForIdle();
      }
      if (controller.signal.aborted) {
        if (timedOut) {
          state.setError({
            code: "run_timeout",
            message: "生成超时，请稍后重试",
            retryable: true,
          });
          writer.send({
            type: "error",
            data: state.error ?? {
              code: "run_timeout",
              message: "生成超时，请稍后重试",
              retryable: true,
            },
          });
        } else {
          state.status = "aborted";
        }
      } else {
        state.status = "completed";
      }

      await citationQueue;
      await this.recheckCitations(input.principal, state);

      writer.send({ type: "usage", data: state.usage });
      writer.send({ type: "run.end", data: state.snapshot() });
    } catch (error) {
      await citationQueue;
      await this.recheckCitations(input.principal, state);

      if (controller.signal.aborted) {
        state.status = "aborted";
        if (timedOut) {
          state.setError({
            code: "run_timeout",
            message: "生成超时，请稍后重试",
            retryable: true,
          });
        }
      } else {
        const payload = toSafeError(error);
        state.setError(payload);
        writer.send({ type: "error", data: payload });
      }

      writer.send({ type: "usage", data: state.usage });
      writer.send({ type: "run.end", data: state.snapshot() });

      if (state.status === "error") {
        this.deps.logger.error(
          {
            runId: input.runId,
            sessionId: input.sessionId,
            errorName: error instanceof Error ? error.name : "unknown",
            errorMessage: error instanceof Error ? error.message.slice(0, 500) : "unknown",
          },
          "agent run failed",
        );
      }
    } finally {
      clearTimeout(timeout);
      if (abortSession) {
        controller.signal.removeEventListener("abort", abortSession);
      }
      this.runs.delete(input.runId);
      this.busySessions.delete(input.sessionId);
      session?.dispose();
      await runModel?.dispose();
      writer.end();
    }
  }

  private handleEvent(
    event: AgentSessionEvent,
    input: ChatRunRequest,
    state: RunState,
    writer: RunEventSink,
    emitCitation: (citation: KbToolDetails["citations"][number]) => void,
  ): void {
    if (writer.isClosed) {
      return;
    }

    switch (event.type) {
      case "message_start": {
        if (event.message.role === "assistant" && !state.sawAssistant) {
          state.sawAssistant = true;
          writer.send({
            type: "message.start",
            data: { messageId: input.assistantMessageId },
          });
        }
        break;
      }
      case "message_update": {
        const update = event.assistantMessageEvent;
        if (update.type === "text_delta" && update.delta.length > 0) {
          state.appendText(update.delta);
          writer.send({ type: "text.delta", data: { delta: update.delta } });
        } else if (update.type === "thinking_delta" && update.delta.length > 0) {
          state.appendThinking(update.delta);
          writer.send({ type: "thinking.delta", data: { delta: update.delta } });
        }
        break;
      }
      case "message_end": {
        if (event.message.role === "assistant") {
          state.finishReason = event.message.stopReason;
          state.addUsage(event.message.usage);
        }
        break;
      }
      case "tool_execution_start": {
        const description = describeToolInput(event.toolName, event.args);
        const tool = state.startTool({
          toolCallId: event.toolCallId,
          toolName: displayToolName(event.toolName),
          label: displayToolName(event.toolName),
          description,
        });
        writer.send({
          type: "tool.start",
          data: {
            toolCallId: tool.id,
            toolName: tool.label,
            label: tool.label,
            description: tool.description,
          },
        });
        break;
      }
      case "tool_execution_end": {
        const details = readKbDetails(event.result);
        const tool = state.endTool({
          toolCallId: event.toolCallId,
          toolName: displayToolName(event.toolName),
          isError: event.isError,
          durationMs: event.durationMs,
          description: details?.summary,
        });
        if (tool) {
          writer.send({
            type: "tool.end",
            data: {
              toolCallId: tool.id,
              toolName: tool.label,
              status: event.isError ? "error" : "ok",
              ...(tool.durationMs !== undefined ? { durationMs: tool.durationMs } : {}),
              ...(details?.summary ? { description: details.summary } : {}),
            },
          });
        }
        if (details) {
          for (const citation of details.citations) {
            emitCitation(citation);
          }
        }
        break;
      }
      case "compaction_start": {
        writer.send({
          type: "compaction",
          data: { phase: "start", reason: event.reason },
        });
        break;
      }
      case "compaction_end": {
        writer.send({
          type: "compaction",
          data: { phase: "end", reason: event.reason },
        });
        break;
      }
      default:
        break;
    }
  }

  private async recheckCitations(principal: InternalPrincipal, state: RunState): Promise<void> {
    const documentIds = new Set(state.citations.refs().map((ref) => ref.citation.documentId));
    for (const documentId of documentIds) {
      try {
        const result = await this.deps.accessClient.check(principal, documentId);
        if (!result.allowed) {
          state.citations.remove(documentId);
        }
      } catch {
        state.citations.remove(documentId);
      }
    }
  }
}

function displayToolName(toolName: string): string {
  if (toolName === "kb_search") {
    return "kb.search";
  }
  if (toolName === "kb_read") {
    return "kb.read";
  }
  return toolName;
}

function describeToolInput(toolName: string, args: unknown): string {
  if (!args || typeof args !== "object") {
    return toolName === "kb_search" ? "检索授权知识库" : "读取引用文档";
  }
  const record = args as Record<string, unknown>;
  if (toolName === "kb_search" && typeof record.query === "string") {
    return `query=${truncate(record.query, 48)} · 检索授权知识库`;
  }
  if (toolName === "kb_read" && typeof record.citation === "number") {
    return `读取引用 [${record.citation}]`;
  }
  return toolName === "kb_search" ? "检索授权知识库" : "读取引用文档";
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function readKbDetails(result: unknown): KbToolDetails | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object") {
    return undefined;
  }
  const citations = (details as { citations?: unknown }).citations;
  if (!Array.isArray(citations)) {
    return undefined;
  }
  return details as KbToolDetails;
}

function toSafeError(error: unknown): ChatErrorPayload {
  if (error instanceof ToolExecutionError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  if (error instanceof AccessClientError) {
    return {
      code: "access_unavailable",
      message: "权限服务暂时不可用，请稍后重试",
      retryable: true,
    };
  }
  if (error instanceof Error && error.message === "model_not_available") {
    return {
      code: "model_not_available",
      message: "模型不可用，请检查模型配置",
      retryable: false,
    };
  }
  if (error instanceof Error && error.name === "AbortError") {
    return { code: "aborted", message: "已停止生成", retryable: false };
  }
  return {
    code: "internal_error",
    message: "生成回答时发生错误，请稍后重试",
    retryable: true,
  };
}
