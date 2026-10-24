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
import { ChunkStore } from "../tools/chunk-store.js";
import { createKbDocumentOutlineTool } from "../tools/kb-document-outline.js";
import { createKbFindInDocumentTool } from "../tools/kb-find-in-document.js";
import { createKbListScopeTool } from "../tools/kb-list-scope.js";
import { createKbReadTool } from "../tools/kb-read.js";
import { createKbReadAroundTool } from "../tools/kb-read-around.js";
import { createKbSearchTool } from "../tools/kb-search.js";
import { type KbToolDetails, ToolExecutionError } from "../tools/types.js";
import { createRunModel, type RunModel } from "./model.js";
import { RunState } from "./run-state.js";
import { openPiSession } from "./session-store.js";
import { buildPIChatSystemPrompt } from "./system-prompt.js";
import { createToolPolicyExtension } from "./tool-policy.js";
import {
  createWebSearchCredentialGate,
  type WebSearchProviderName,
} from "./web-search-credential.js";
import { loadWebSearchExtension } from "./web-search-extension.js";

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
    let webSearchGate: ReturnType<typeof createWebSearchCredentialGate> | undefined;
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

      const knowledgeBaseIds =
        input.knowledgeBaseIds === undefined
          ? undefined
          : [...new Set(input.knowledgeBaseIds.map((id) => id.trim()).filter(Boolean))];
      const webSearchEnabled = input.webSearch === true;
      const webSearchSettings = webSearchEnabled
        ? resolveWebSearchSettings(input.webSearchConfig, this.deps.config.webSearch)
        : undefined;
      webSearchGate = webSearchSettings
        ? createWebSearchCredentialGate(webSearchSettings)
        : undefined;
      const webSearchExtension = webSearchEnabled
        ? await loadWebSearchExtension(this.deps.config)
        : undefined;
      const resourceLoader = new DefaultResourceLoader({
        cwd: opened.workspace,
        agentDir: join(opened.workspace, ".pi"),
        noExtensions: true,
        noSkills: true,
        noContextFiles: true,
        extensionFactories: [
          createToolPolicyExtension({
            allowWebSearch: webSearchEnabled,
            webSearchMaxResults: this.deps.config.webSearch.maxResults,
            ...(webSearchSettings
              ? {
                  webSearchProvider: webSearchSettings.provider,
                  webSearchProxy: webSearchSettings.proxy,
                  webSearchGate,
                }
              : {}),
          }),
          ...(webSearchExtension ? [webSearchExtension] : []),
        ],
        systemPromptOverride: () =>
          buildPIChatSystemPrompt(webSearchEnabled, this.deps.config.webSearch.maxResults),
      });
      await resourceLoader.reload();

      const toolContext = {
        principal: input.principal,
        accessClient: this.deps.accessClient,
        ragflow: this.deps.ragflow,
        citations: state.citations,
        documents: state.documents,
        chunks: new ChunkStore(this.deps.ragflow),
        config: this.deps.config,
        knowledgeBaseIds,
      };
      const toolNames = [
        "kb_search",
        "kb_read",
        "kb_list_scope",
        "kb_read_around",
        "kb_find_in_document",
        "kb_document_outline",
        ...(webSearchEnabled ? ["web_search"] : []),
      ];

      const created = await createAgentSession({
        cwd: opened.workspace,
        agentDir: join(opened.workspace, ".pi"),
        modelRuntime: runModel.runtime,
        model: runModel.model,
        thinkingLevel: input.thinkingLevel,
        noTools: "all",
        tools: toolNames,
        customTools: [
          createKbSearchTool(toolContext),
          createKbReadTool(toolContext),
          createKbListScopeTool(toolContext),
          createKbReadAroundTool(toolContext),
          createKbFindInDocumentTool(toolContext),
          createKbDocumentOutlineTool(toolContext),
        ],
        resourceLoader,
        settingsManager: SettingsManager.inMemory(),
        sessionManager: opened.sessionManager,
        sessionStartEvent: { type: "session_start", reason: opened.restored ? "resume" : "new" },
      });
      session = created.session;
      session.setActiveToolsByName(toolNames);
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
      webSearchGate?.release();
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
  if (toolName === "kb_list_scope") {
    return "kb.list";
  }
  if (toolName === "kb_read_around") {
    return "kb.read_around";
  }
  if (toolName === "kb_find_in_document") {
    return "kb.find";
  }
  if (toolName === "kb_document_outline") {
    return "kb.outline";
  }
  if (toolName === "web_search") {
    return "web.search";
  }
  return toolName;
}

function describeToolInput(toolName: string, args: unknown): string {
  if (!args || typeof args !== "object") {
    return fallbackToolDescription(toolName);
  }
  const record = args as Record<string, unknown>;
  if (toolName === "kb_search" && typeof record.query === "string") {
    return `query=${truncate(record.query, 48)} · 检索授权知识库`;
  }
  if (toolName === "kb_read" && typeof record.citation === "number") {
    return `读取引用 [${record.citation}]`;
  }
  if (toolName === "kb_list_scope") {
    return typeof record.query === "string"
      ? `筛选 ${truncate(record.query, 32)} · 列出授权范围`
      : "列出授权知识库";
  }
  if (toolName === "kb_read_around") {
    if (typeof record.citation === "number") {
      return `读取引用 [${record.citation}] 的前后片段`;
    }
    if (typeof record.document === "string") {
      return typeof record.chunkIndex === "number"
        ? `读取 ${record.document} 第 ${record.chunkIndex} 段的前后片段`
        : `读取 ${record.document} 的首段前后片段`;
    }
  }
  if (toolName === "kb_find_in_document" && typeof record.query === "string") {
    return `精确查找 ${truncate(record.query, 40)}`;
  }
  if (toolName === "kb_document_outline") {
    return "查看文档目录";
  }
  if (toolName === "web_search") {
    const queries = Array.isArray(record.queries)
      ? record.queries.filter((query): query is string => typeof query === "string")
      : [];
    if (queries.length > 0) {
      return `搜索 ${truncate(queries.slice(0, 2).join(" / "), 48)}`;
    }
    if (typeof record.query === "string") {
      return `搜索 ${truncate(record.query, 48)}`;
    }
  }
  return fallbackToolDescription(toolName);
}

function resolveWebSearchSettings(
  requestConfig: ChatRunRequest["webSearchConfig"] | undefined,
  fallback: RuntimeConfig["webSearch"],
): { provider: WebSearchProviderName; apiKey: string; proxy?: string } {
  const provider =
    requestConfig?.provider === "tavily" || requestConfig?.provider === "bocha"
      ? requestConfig.provider
      : fallback.provider;
  return {
    provider,
    apiKey: requestConfig?.apiKey?.trim() || fallback.apiKey,
    ...(requestConfig?.proxy?.trim() ? { proxy: requestConfig.proxy.trim() } : {}),
  };
}

function fallbackToolDescription(toolName: string): string {
  if (toolName === "kb_search") {
    return "检索授权知识库";
  }
  if (toolName === "kb_read") {
    return "读取引用文档";
  }
  if (toolName === "kb_list_scope") {
    return "列出授权知识库";
  }
  if (toolName === "kb_read_around") {
    return "读取片段前后文";
  }
  if (toolName === "kb_find_in_document") {
    return "在文档内精确查找";
  }
  if (toolName === "kb_document_outline") {
    return "查看文档目录";
  }
  if (toolName === "web_search") {
    return "联网搜索";
  }
  return toolName;
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
