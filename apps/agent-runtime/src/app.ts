import { timingSafeEqual } from "node:crypto";
import type { ChatRunRequest, ThinkingLevel, UserRole } from "@pichat/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { AccessClient } from "./clients/access-client.js";
import { createRagflowClient } from "./clients/ragflow.js";
import { loadRuntimeConfig, type RuntimeConfig } from "./config.js";
import { type RunLogger, RunService } from "./runtime/run-service.js";
import { SseWriter } from "./runtime/sse-writer.js";

const thinkingLevelSchema = z.enum([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]) satisfies z.ZodType<ThinkingLevel>;

const roleSchema = z.enum([
  "member",
  "knowledge_admin",
  "security_admin",
  "tenant_admin",
]) satisfies z.ZodType<UserRole>;

const principalSchema = z.object({
  tenantId: z.string().min(1).max(64),
  userId: z.string().min(1).max(64),
  role: roleSchema,
  groupIds: z.array(z.string().min(1).max(64)).max(200),
});

const runRequestSchema = z.object({
  runId: z.string().min(1).max(64),
  sessionId: z.string().min(1).max(64),
  assistantMessageId: z.string().min(1).max(64),
  principal: principalSchema,
  model: z.object({
    provider: z.string().min(1).max(60),
    modelId: z.string().min(1).max(120),
    displayName: z.string().min(1).max(120),
    baseUrl: z
      .string()
      .max(512)
      .refine((value) => /^https?:\/\//i.test(value), "baseUrl must be http(s)"),
    apiKey: z.string().min(1).max(4096),
  }),
  thinkingLevel: thinkingLevelSchema,
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(50_000),
        createdAt: z.string().max(64),
      }),
    )
    .max(40),
  prompt: z.string().trim().min(1).max(20_000),
});

export interface RuntimeAppOptions {
  config?: RuntimeConfig;
  accessClient?: AccessClient;
  runService?: RunService;
}

export async function buildRuntimeApp(options: RuntimeAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadRuntimeConfig();
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: {
        paths: ["req.headers.authorization", "request.headers.authorization", "*.apiKey", "apiKey"],
        censor: "[redacted]",
      },
    },
    bodyLimit: 2 * 1024 * 1024,
  });

  const logger: RunLogger = {
    info(payload, message) {
      app.log.info(payload, message);
    },
    error(payload, message) {
      app.log.error(payload, message);
    },
  };

  const accessClient =
    options.accessClient ??
    new AccessClient({
      baseUrl: config.apiInternalUrl,
      secret: config.internalSecret,
    });
  const runService =
    options.runService ??
    new RunService({
      config,
      accessClient,
      ragflow: createRagflowClient(config),
      logger,
    });

  app.get("/internal/health", async () => ({
    status: "ok",
    service: "pichat-agent-runtime",
    timestamp: new Date().toISOString(),
  }));

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/internal/chat/") && request.url !== "/internal/runtime") {
      return;
    }
    if (!isAuthorized(request.headers.authorization, config.internalSecret)) {
      await reply.code(401).send({ code: "unauthenticated", message: "内部服务认证失败" });
    }
  });

  app.get("/internal/runtime", async () => ({
    service: "pichat-agent-runtime",
    piPackage: "@earendil-works/pi-coding-agent",
    tools: ["kb.search", "kb.read"],
    storage: "jsonl",
  }));

  app.post("/internal/chat/run", async (request, reply) => {
    const parsed = runRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      await reply.code(400).send({ code: "invalid_request", message: "运行参数无效" });
      return;
    }

    const input = parsed.data as ChatRunRequest;
    if (runService.hasRun(input.runId)) {
      await reply.code(409).send({ code: "conflict", message: "运行 ID 已存在" });
      return;
    }
    if (runService.isSessionBusy(input.sessionId)) {
      await reply.code(409).send({ code: "conflict", message: "该会话正在生成回答" });
      return;
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });

    const writer = new SseWriter(reply.raw, input.runId);
    reply.raw.on("close", () => {
      if (!reply.raw.writableEnded) {
        runService.abort(input.runId);
      }
    });

    try {
      await runService.run(input, writer);
    } catch (error) {
      app.log.error(
        { runId: input.runId, errorName: error instanceof Error ? error.name : "unknown" },
        "internal run rejected",
      );
      writer.end();
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        reply.raw.end();
      }
    }
  });

  app.post("/internal/chat/runs/:runId/abort", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    if (!runService.abort(runId)) {
      await reply.code(404).send({ code: "not_found", message: "运行不存在" });
      return;
    }
    await reply.code(204).send();
  });

  return app;
}

function isAuthorized(header: string | undefined, secret: string): boolean {
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) {
    return false;
  }
  const token = header.slice(prefix.length);
  const expected = Buffer.from(secret);
  const actual = Buffer.from(token);
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}
