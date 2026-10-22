import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { RAGFlowClient } from "@pichat/ragflow-client";
import type { ChatRunRequest, TypedSseEvent } from "@pichat/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AccessClient } from "../clients/access-client.js";
import type { RuntimeConfig } from "../config.js";
import { type RunEventSink, RunService } from "./run-service.js";

const tenantId = "tenant-runtime-test";
const userId = "user-runtime-test";
const sessionId = "session-runtime-test";

describe("RunService", () => {
  let dataDir: string;
  let service: RunService;

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "pichat-runtime-test-"));

    const accessClient = {
      async scope() {
        return {
          knowledgeBases: [
            {
              id: "kb-1",
              name: "内部制度",
              ragflowDatasetId: "ds-1",
              documents: [{ id: "doc-1", title: "差旅制度.pdf", ragflowDocumentId: "rf-doc-1" }],
            },
          ],
        };
      },
      async check() {
        return { allowed: true, reason: "allowed" as const };
      },
    } as unknown as AccessClient;

    const ragflow = {
      async retrieve() {
        return [
          {
            id: "chunk-1",
            content: "一线城市住宿标准为每人每晚 650 元。",
            documentId: "rf-doc-1",
            documentKeyword: "差旅制度",
            similarity: 0.92,
            vectorSimilarity: 0.9,
            termSimilarity: 0.2,
          },
        ];
      },
    } as unknown as RAGFlowClient;

    const config: RuntimeConfig = {
      port: 3002,
      internalSecret: "test",
      apiInternalUrl: "http://127.0.0.1:3001",
      dataDir,
      runTimeoutMs: 10_000,
      ragflow: { baseUrl: "http://ragflow", apiKey: "key", timeoutMs: 1000 },
      search: {
        topK: 6,
        maxTopK: 12,
        similarityThreshold: 0.2,
        maxSnippetChars: 1200,
        maxResultChars: 12_000,
      },
      model: { contextWindow: 128_000, maxTokens: 8192 },
    };

    const faux = fauxProvider({
      models: [
        {
          id: "test-model",
          name: "Test Model",
          reasoning: false,
          input: ["text"],
          contextWindow: 128_000,
          maxTokens: 8192,
        },
      ],
    });
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("kb_search", { query: "住宿标准" })], {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage("根据 [1]，一线城市住宿标准为每人每晚 650 元。"),
    ]);

    service = new RunService({
      config,
      accessClient,
      ragflow,
      logger: { info() {}, error() {} },
      async createModel(_input, _config) {
        const runtime = await ModelRuntime.create({
          authPath: join(dataDir, "auth.json"),
          modelsPath: null,
          refreshOnCreate: false,
        });
        runtime.registerNativeProvider(faux.provider);
        const model = runtime.getModel(faux.provider.id, "test-model") ?? faux.getModel();
        return {
          runtime,
          model,
          providerId: faux.provider.id,
          async dispose() {},
        };
      },
    });
  });

  afterAll(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("runs Pi, calls kb_search, emits citations and persists JSONL", async () => {
    const events: TypedSseEvent[] = [];
    const writer: RunEventSink = {
      isClosed: false,
      send(event) {
        events.push(event);
      },
      end() {},
    };

    const input: ChatRunRequest = {
      runId: "run-1",
      sessionId,
      assistantMessageId: "assistant-1",
      principal: {
        tenantId,
        userId,
        role: "member",
        groupIds: [],
      },
      model: {
        provider: "opencode-go",
        modelId: "test-model",
        displayName: "Test Model",
        baseUrl: "http://127.0.0.1:9/v1",
        apiKey: "test-key",
      },
      thinkingLevel: "off",
      history: [],
      prompt: "出差住宿标准是多少？",
    };

    await service.run(input, writer);

    const types = events.map((event) => event.type);
    expect(types).toContain("run.start");
    expect(types).toContain("tool.start");
    expect(types).toContain("citation.add");
    expect(types).toContain("text.delta");
    expect(types).toContain("run.end");

    const toolStart = events.find((event) => event.type === "tool.start");
    expect(toolStart?.data).toMatchObject({ toolName: "kb.search" });

    const citation = events.find((event) => event.type === "citation.add");
    expect(citation?.data).toMatchObject({ index: 1, documentId: "doc-1" });

    const runEnd = events.find((event) => event.type === "run.end");
    expect(runEnd?.data).toMatchObject({
      status: "completed",
      citations: [{ index: 1, documentId: "doc-1" }],
    });
    expect(JSON.stringify(runEnd?.data)).toContain("650");

    const files = await readdir(join(dataDir, tenantId, userId, sessionId, "pi-sessions"));
    expect(files.some((file) => file.endsWith(".jsonl"))).toBe(true);
  });
});
