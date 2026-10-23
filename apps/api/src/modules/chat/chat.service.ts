import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Database } from "@pichat/db";
import { agentSessions, messages } from "@pichat/db";
import type {
  ChatCitation,
  ChatMessageMetadata,
  ChatMessageSummary,
  ChatRunHistoryMessage,
  ChatRunRequest,
  ChatSessionSummary,
  ChatToolCall,
  ChatUsage,
  RunEndData,
  SendChatMessageRequest,
  SessionUser,
  ThinkingLevel,
} from "@pichat/shared";
import {
  chatCitationSchema,
  createSseParser,
  emptyChatUsage,
  encodeSseEvent,
  resolveCitationUsage,
  sseDataSchemas,
} from "@pichat/shared";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import { conflict, notFound, serviceUnavailable } from "../../common/api-error";
import { DATABASE } from "../../common/database.module";
import {
  ModelConfigsService,
  type ResolvedModelConfig,
} from "../model-configs/model-configs.service";
import { ChatRuntimeClient } from "./chat-runtime.client";

const maxHistoryMessages = 20;
const maxMessageChars = 20_000;
const thinkingLevelSet = new Set<ThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

interface ActiveRun {
  principal: SessionUser;
  sessionId: string;
}

interface AccumulatedRun {
  content: string;
  thinking: string;
  tools: Map<string, ChatToolCall>;
  citations: Map<string, ChatCitation>;
  usage: ChatUsage;
  error?: RunEndData["error"];
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly activeSessions = new Set<string>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ModelConfigsService) private readonly modelConfigsService: ModelConfigsService,
    @Inject(ChatRuntimeClient) private readonly runtimeClient: ChatRuntimeClient,
  ) {}

  async listSessions(principal: SessionUser): Promise<ChatSessionSummary[]> {
    const rows = await this.db
      .select()
      .from(agentSessions)
      .where(
        and(eq(agentSessions.tenantId, principal.tenantId), eq(agentSessions.userId, principal.id)),
      )
      .orderBy(desc(agentSessions.updatedAt));
    return rows.map((row) => this.toSessionSummary(row));
  }

  async createSession(
    principal: SessionUser,
    input: { title?: string } = {},
  ): Promise<ChatSessionSummary> {
    const id = randomUUID();
    const title = input.title?.trim().slice(0, 200) || "新对话";
    await this.db.insert(agentSessions).values({
      id,
      tenantId: principal.tenantId,
      userId: principal.id,
      title,
      modelProvider: "",
      modelId: "",
      thinkingLevel: "medium",
    });

    const rows = await this.db
      .select()
      .from(agentSessions)
      .where(
        and(
          eq(agentSessions.id, id),
          eq(agentSessions.tenantId, principal.tenantId),
          eq(agentSessions.userId, principal.id),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw notFound("会话不存在");
    }
    return this.toSessionSummary(row);
  }

  async getMessages(
    principal: SessionUser,
    sessionId: string,
  ): Promise<{ session: ChatSessionSummary; messages: ChatMessageSummary[] }> {
    const session = await this.findOwnedSession(principal, sessionId);
    if (!session) {
      throw notFound("会话不存在");
    }

    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt))
      .limit(500);

    return {
      session: this.toSessionSummary(session),
      messages: rows.flatMap((row) => {
        if (row.role !== "user" && row.role !== "assistant") {
          return [];
        }
        return [
          {
            id: row.id,
            role: row.role,
            content: row.content,
            createdAt: row.createdAt.toISOString(),
            metadata: (row.metadata as ChatMessageMetadata | null) ?? null,
          } satisfies ChatMessageSummary,
        ];
      }),
    };
  }

  async stream(
    principal: SessionUser,
    sessionId: string,
    input: SendChatMessageRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const session = await this.findOwnedSession(principal, sessionId);
    if (!session) {
      throw notFound("会话不存在");
    }
    if (this.activeSessions.has(sessionId)) {
      throw conflict("该会话正在生成回答");
    }
    this.activeSessions.add(sessionId);

    const content = input.content.trim();
    if (content.length === 0) {
      this.activeSessions.delete(sessionId);
      throw conflict("消息内容不能为空");
    }
    if (content.length > maxMessageChars) {
      this.activeSessions.delete(sessionId);
      throw conflict("消息内容过长");
    }

    let model: ResolvedModelConfig;
    let prepared: {
      prompt: string;
      history: ChatRunHistoryMessage[];
      insertUserMessage: boolean;
    };
    try {
      model = await this.modelConfigsService.resolveForRun(principal, input.modelConfigId);
      prepared = await this.preparePrompt(sessionId, content, input.retry === true);
    } catch (error) {
      this.activeSessions.delete(sessionId);
      throw error;
    }

    const thinkingLevel = this.resolveThinkingLevel(input.thinkingLevel ?? session.thinkingLevel);
    const runId = randomUUID();
    const assistantMessageId = randomUUID();
    const controller = new AbortController();

    this.activeRuns.set(runId, { principal, sessionId });

    const runInput: ChatRunRequest = {
      runId,
      sessionId,
      assistantMessageId,
      principal: {
        tenantId: principal.tenantId,
        userId: principal.id,
        role: principal.role,
        groupIds: principal.groupIds,
      },
      model: {
        provider: model.provider,
        modelId: model.modelId,
        displayName: model.displayName,
        baseUrl: model.baseUrl,
        apiKey: model.apiKey,
      },
      thinkingLevel,
      history: prepared.history,
      prompt: prepared.prompt,
    };

    let upstream: Response;
    try {
      upstream = await this.runtimeClient.startRun(runInput, controller.signal);
    } catch (error) {
      this.cleanup(sessionId, runId);
      throw error;
    }

    if (!upstream.ok) {
      this.cleanup(sessionId, runId);
      if (upstream.status === 409) {
        throw conflict("该会话正在生成回答");
      }
      throw serviceUnavailable("Agent Runtime 暂时不可用，请确认服务已启动");
    }

    try {
      if (prepared.insertUserMessage) {
        await this.insertUserMessage(session, content);
      }
      await this.updateSessionForRun(session, prepared.prompt, model, thinkingLevel);
    } catch (error) {
      void this.runtimeClient.abortRun(runId);
      this.cleanup(sessionId, runId);
      throw error;
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });

    let clientClosed = false;
    const onClose = () => {
      if (!reply.raw.writableEnded) {
        clientClosed = true;
        controller.abort();
      }
    };
    reply.raw.on("close", onClose);

    const accumulated = createAccumulatedRun();
    let runEnd: RunEndData | undefined;
    const parser = createSseParser((event) => {
      this.accumulateEvent(event.type, event.data, accumulated);
      if (event.type === "run.end") {
        const parsed = sseDataSchemas["run.end"].safeParse(event.data);
        if (parsed.success) {
          runEnd = parsed.data;
        }
      }
    });

    try {
      await this.pipeUpstream(upstream, reply, parser, () => clientClosed);
      parser.flush();

      if (!runEnd) {
        const fallback = buildFallbackRunEnd(
          runId,
          sessionId,
          assistantMessageId,
          accumulated,
          clientClosed,
        );
        if (!clientClosed) {
          reply.raw.write(
            encodeSseEvent({
              type: "error",
              data: fallback.error ?? {
                code: "stream_interrupted",
                message: "生成中断，请重试",
                retryable: true,
              },
            }),
          );
          reply.raw.write(encodeSseEvent({ type: "run.end", data: fallback }));
        }
        runEnd = fallback;
      }

      await this.persistAssistant(session, assistantMessageId, runId, model, thinkingLevel, runEnd);
    } catch (error) {
      this.logger.error(
        `chat stream failed runId=${runId} error=${error instanceof Error ? error.name : "unknown"}`,
      );
      const fallback = buildFallbackRunEnd(
        runId,
        sessionId,
        assistantMessageId,
        accumulated,
        clientClosed,
      );
      if (!runEnd && !clientClosed && !reply.raw.writableEnded) {
        reply.raw.write(
          encodeSseEvent({
            type: "error",
            data: {
              code: "stream_interrupted",
              message: "生成中断，请重试",
              retryable: true,
            },
          }),
        );
        reply.raw.write(encodeSseEvent({ type: "run.end", data: fallback }));
      }
      try {
        await this.persistAssistant(
          session,
          assistantMessageId,
          runId,
          model,
          thinkingLevel,
          fallback,
        );
      } catch {
        this.logger.error(`chat persist failed runId=${runId}`);
      }
    } finally {
      reply.raw.off("close", onClose);
      this.cleanup(sessionId, runId);
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        reply.raw.end();
      }
    }
  }

  async abort(principal: SessionUser, runId: string): Promise<boolean> {
    const run = this.activeRuns.get(runId);
    if (
      !run ||
      run.principal.id !== principal.id ||
      run.principal.tenantId !== principal.tenantId
    ) {
      return false;
    }
    await this.runtimeClient.abortRun(runId);
    return true;
  }

  private async findOwnedSession(
    principal: SessionUser,
    sessionId: string,
  ): Promise<typeof agentSessions.$inferSelect | null> {
    const rows = await this.db
      .select()
      .from(agentSessions)
      .where(
        and(
          eq(agentSessions.id, sessionId),
          eq(agentSessions.tenantId, principal.tenantId),
          eq(agentSessions.userId, principal.id),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  private async preparePrompt(
    sessionId: string,
    content: string,
    retry: boolean,
  ): Promise<{
    prompt: string;
    history: ChatRunHistoryMessage[];
    insertUserMessage: boolean;
  }> {
    if (!retry) {
      return {
        prompt: content,
        history: await this.loadHistory(sessionId),
        insertUserMessage: true,
      };
    }

    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.createdAt))
      .limit(3);

    const last = rows[0];
    let lastUser = last?.role === "user" ? last : undefined;

    if (last?.role === "assistant") {
      const status = (last.metadata as ChatMessageMetadata | null)?.status;
      if (status !== "error" && status !== "aborted") {
        throw conflict("最后一条回答没有失败，无法重试");
      }
      lastUser = rows[1]?.role === "user" ? rows[1] : undefined;
      if (!lastUser) {
        throw conflict("找不到可重试的问题");
      }
      await this.db.delete(messages).where(eq(messages.id, last.id));
    }

    if (!lastUser) {
      throw conflict("没有可重试的问题");
    }

    return {
      prompt: lastUser.content,
      history: await this.loadHistoryBefore(sessionId, lastUser.createdAt),
      insertUserMessage: false,
    };
  }

  private async loadHistory(sessionId: string): Promise<ChatRunHistoryMessage[]> {
    const rows = await this.db
      .select({
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.createdAt))
      .limit(maxHistoryMessages);

    return rows
      .reverse()
      .flatMap((row) =>
        row.role === "user" || row.role === "assistant"
          ? [{ role: row.role, content: row.content, createdAt: row.createdAt.toISOString() }]
          : [],
      );
  }

  private async loadHistoryBefore(
    sessionId: string,
    before: Date,
  ): Promise<ChatRunHistoryMessage[]> {
    const rows = await this.db
      .select({
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(eq(messages.sessionId, sessionId), lt(messages.createdAt, before)))
      .orderBy(desc(messages.createdAt))
      .limit(maxHistoryMessages);

    return rows
      .reverse()
      .flatMap((row) =>
        row.role === "user" || row.role === "assistant"
          ? [{ role: row.role, content: row.content, createdAt: row.createdAt.toISOString() }]
          : [],
      );
  }

  private async insertUserMessage(
    session: typeof agentSessions.$inferSelect,
    content: string,
  ): Promise<void> {
    await this.db.insert(messages).values({
      id: randomUUID(),
      sessionId: session.id,
      role: "user",
      content,
      metadata: null,
      createdAt: new Date(),
    });
  }

  private async updateSessionForRun(
    session: typeof agentSessions.$inferSelect,
    content: string,
    model: ResolvedModelConfig,
    thinkingLevel: ThinkingLevel,
  ): Promise<void> {
    const title =
      session.title.trim().length === 0 || session.title === "新对话"
        ? content.slice(0, 60)
        : session.title;

    await this.db
      .update(agentSessions)
      .set({
        title,
        modelProvider: model.provider,
        modelId: model.modelId,
        thinkingLevel,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(agentSessions.id, session.id),
          eq(agentSessions.tenantId, session.tenantId),
          eq(agentSessions.userId, session.userId),
        ),
      );
  }

  private async persistAssistant(
    session: typeof agentSessions.$inferSelect,
    assistantMessageId: string,
    runId: string,
    model: ResolvedModelConfig,
    thinkingLevel: ThinkingLevel,
    runEnd: RunEndData,
  ): Promise<void> {
    const metadata: ChatMessageMetadata = {
      runId,
      status: runEnd.status,
      model: {
        provider: model.provider,
        modelId: model.modelId,
        displayName: model.displayName,
      },
      thinkingLevel,
      thinking: runEnd.thinking,
      tools: runEnd.tools,
      citations: runEnd.citations,
      usage: runEnd.usage,
      ...(runEnd.error ? { error: runEnd.error } : {}),
    };

    await this.db.insert(messages).values({
      id: assistantMessageId,
      sessionId: session.id,
      role: "assistant",
      content: runEnd.content,
      metadata,
      createdAt: new Date(),
    });

    await this.db
      .update(agentSessions)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(agentSessions.id, session.id),
          eq(agentSessions.tenantId, session.tenantId),
          eq(agentSessions.userId, session.userId),
        ),
      );
  }

  private async pipeUpstream(
    upstream: Response,
    reply: FastifyReply,
    parser: ReturnType<typeof createSseParser>,
    isClientClosed: () => boolean,
  ): Promise<void> {
    const reader = upstream.body?.getReader();
    if (!reader) {
      return;
    }
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (!value || value.length === 0) {
          continue;
        }
        if (!isClientClosed() && !reply.raw.writableEnded) {
          if (!reply.raw.write(Buffer.from(value))) {
            await once(reply.raw, "drain");
          }
        }
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.push(decoder.decode());
    } finally {
      await reader.cancel().catch(() => {});
    }
  }

  private accumulateEvent(
    type: string,
    data: Record<string, unknown>,
    accumulated: AccumulatedRun,
  ): void {
    switch (type) {
      case "text.delta":
        if (typeof data.delta === "string") {
          accumulated.content += data.delta;
        }
        break;
      case "thinking.delta":
        if (typeof data.delta === "string") {
          accumulated.thinking += data.delta;
        }
        break;
      case "tool.start": {
        if (
          typeof data.toolCallId === "string" &&
          typeof data.toolName === "string" &&
          typeof data.label === "string" &&
          typeof data.description === "string"
        ) {
          accumulated.tools.set(data.toolCallId, {
            id: data.toolCallId,
            name: data.toolName,
            label: data.label,
            description: data.description,
            status: "running",
          });
        }
        break;
      }
      case "tool.end": {
        if (typeof data.toolCallId === "string") {
          const tool = accumulated.tools.get(data.toolCallId);
          if (tool) {
            tool.status = data.status === "error" ? "error" : "done";
            if (typeof data.durationMs === "number") {
              tool.durationMs = data.durationMs;
            }
            if (typeof data.description === "string") {
              tool.description = data.description;
            }
          }
        }
        break;
      }
      case "citation.add": {
        const parsed = chatCitationSchema.safeParse(data);
        if (parsed.success) {
          accumulated.citations.set(parsed.data.id, parsed.data);
        }
        break;
      }
      case "usage": {
        const parsed = sseDataSchemas.usage.safeParse(data);
        if (parsed.success) {
          accumulated.usage = parsed.data;
        }
        break;
      }
      case "error": {
        const parsed = sseDataSchemas.error.safeParse(data);
        if (parsed.success) {
          accumulated.error = parsed.data;
        }
        break;
      }
      default:
        break;
    }
  }

  private toSessionSummary(row: typeof agentSessions.$inferSelect): ChatSessionSummary {
    return {
      id: row.id,
      title: row.title,
      modelProvider: row.modelProvider,
      modelId: row.modelId,
      thinkingLevel: this.resolveThinkingLevel(row.thinkingLevel),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private resolveThinkingLevel(value: string): ThinkingLevel {
    return thinkingLevelSet.has(value as ThinkingLevel) ? (value as ThinkingLevel) : "medium";
  }

  private cleanup(sessionId: string, runId: string): void {
    this.activeSessions.delete(sessionId);
    this.activeRuns.delete(runId);
  }
}

function createAccumulatedRun(): AccumulatedRun {
  return {
    content: "",
    thinking: "",
    tools: new Map(),
    citations: new Map(),
    usage: { ...emptyChatUsage },
  };
}

function buildFallbackRunEnd(
  runId: string,
  sessionId: string,
  assistantMessageId: string,
  accumulated: AccumulatedRun,
  clientClosed: boolean,
): RunEndData {
  return {
    runId,
    sessionId,
    assistantMessageId,
    status: clientClosed ? "aborted" : "error",
    content: accumulated.content,
    thinking: accumulated.thinking,
    tools: [...accumulated.tools.values()],
    citations: resolveCitationUsage(
      [...accumulated.citations.values()].sort((left, right) => left.index - right.index),
      accumulated.content,
    ),
    usage: accumulated.usage,
    error: accumulated.error ?? {
      code: clientClosed ? "client_closed" : "stream_interrupted",
      message: clientClosed ? "连接已断开" : "生成中断，请重试",
      retryable: !clientClosed,
    },
  };
}
