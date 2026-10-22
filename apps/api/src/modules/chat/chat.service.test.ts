import { randomUUID } from "node:crypto";
import type { Database } from "@pichat/db";
import { createDatabase, messages, tenants, users } from "@pichat/db";
import type { ChatRunRequest, SessionUser } from "@pichat/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiException } from "../../common/api-error";
import type { ModelConfigsService } from "../model-configs/model-configs.service";
import { ChatService } from "./chat.service";
import type { ChatRuntimeClient } from "./chat-runtime.client";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("ChatService", () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();

  let db: Database;
  let service: ChatService;

  const user: SessionUser = {
    id: userId,
    tenantId,
    email: `chat-${tenantId}@test.local`,
    displayName: "Chat User",
    role: "member",
    groupIds: [],
  };
  const otherUser: SessionUser = {
    id: otherUserId,
    tenantId: otherTenantId,
    email: `other-${otherTenantId}@test.local`,
    displayName: "Other User",
    role: "member",
    groupIds: [],
  };

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL as string);
    service = new ChatService(db, {} as ModelConfigsService, {} as ChatRuntimeClient);

    await db.insert(tenants).values([
      { id: tenantId, name: "Chat", slug: tenantId },
      { id: otherTenantId, name: "Chat Other", slug: otherTenantId },
    ]);
    await db.insert(users).values([
      {
        id: userId,
        tenantId,
        email: user.email,
        passwordHash: "scrypt$00$00",
        displayName: user.displayName,
      },
      {
        id: otherUserId,
        tenantId: otherTenantId,
        email: otherUser.email,
        passwordHash: "scrypt$00$00",
        displayName: otherUser.displayName,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(tenants).where(eq(tenants.id, otherTenantId));
  });

  it("creates a session for the current user and lists only owned sessions", async () => {
    const created = await service.createSession(user, { title: "测试会话" });
    expect(created).toMatchObject({ title: "测试会话", thinkingLevel: "medium" });

    const own = await service.listSessions(user);
    const others = await service.listSessions(otherUser);
    expect(own.map((session) => session.id)).toContain(created.id);
    expect(others).toEqual([]);
  });

  it("returns 404 for another tenant's session", async () => {
    const created = await service.createSession(user, {});
    await expect(service.getMessages(otherUser, created.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("does not abort a run owned by another user", async () => {
    await expect(service.abort(otherUser, randomUUID())).resolves.toBe(false);
  });

  it("classifies missing sessions as not found", async () => {
    const error = await service.getMessages(user, randomUUID()).catch((cause) => cause);
    expect(error).toBeInstanceOf(ApiException);
  });

  it("retries a failed answer without inserting a duplicate user message", async () => {
    const created = await service.createSession(user, { title: "重试会话" });
    const failedAt = new Date(Date.now() - 1000);
    await db.insert(messages).values({
      id: randomUUID(),
      sessionId: created.id,
      role: "user",
      content: "重试问题",
      metadata: null,
      createdAt: failedAt,
    });
    await db.insert(messages).values({
      id: randomUUID(),
      sessionId: created.id,
      role: "assistant",
      content: "",
      metadata: { status: "error", error: { code: "internal_error", message: "失败" } },
      createdAt: new Date(),
    });

    let captured: ChatRunRequest | undefined;
    const runtimeClient = {
      async startRun(input: ChatRunRequest) {
        captured = input;
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `event: run.end\ndata: ${JSON.stringify({
                  runId: input.runId,
                  sessionId: input.sessionId,
                  assistantMessageId: input.assistantMessageId,
                  status: "completed",
                  finishReason: "stop",
                  content: "重试成功",
                  thinking: "",
                  tools: [],
                  citations: [],
                  usage: {
                    inputTokens: 1,
                    outputTokens: 1,
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                    totalTokens: 2,
                  },
                })}\n\n`,
              ),
            );
            controller.close();
          },
        });
        return new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
      async abortRun() {},
    } as unknown as ChatRuntimeClient;
    const modelConfigs = {
      async resolveForRun() {
        return {
          id: "cfg-1",
          provider: "opencode-go",
          modelId: "test-model",
          displayName: "Test",
          baseUrl: "http://127.0.0.1:9/v1",
          apiKey: "test",
        };
      },
    } as unknown as ModelConfigsService;
    const streamService = new ChatService(db, modelConfigs, runtimeClient);

    const reply = {
      hijack() {},
      raw: {
        writableEnded: false,
        destroyed: false,
        writeHead() {},
        write() {
          return true;
        },
        end() {
          (this as { writableEnded: boolean }).writableEnded = true;
        },
        on() {},
        off() {},
      },
    };

    await streamService.stream(
      user,
      created.id,
      { content: "重试问题", thinkingLevel: "off", retry: true },
      reply as never,
    );

    expect(captured?.prompt).toBe("重试问题");
    expect(captured?.history).toEqual([]);

    const result = await service.getMessages(user, created.id);
    expect(result.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(result.messages[1]).toMatchObject({
      content: "重试成功",
      metadata: { status: "completed" },
    });
  });
});
