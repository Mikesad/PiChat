import type { RAGFlowClient, RetrievalChunk } from "@pichat/ragflow-client";
import { describe, expect, it } from "vitest";
import type { AccessClient } from "../clients/access-client.js";
import type { RuntimeConfig } from "../config.js";
import { CitationRegistry } from "../runtime/citation-registry.js";
import { createKbSearchTool } from "./kb-search.js";
import type { KbToolDetails } from "./types.js";

const config: RuntimeConfig = {
  port: 3002,
  internalSecret: "test",
  apiInternalUrl: "http://127.0.0.1:3001",
  dataDir: "test-data",
  runTimeoutMs: 1000,
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

const chunks: RetrievalChunk[] = [
  {
    id: "chunk-1",
    content: "差旅住宿标准",
    documentId: "rf-doc-1",
    documentKeyword: "",
    similarity: 0.9,
    vectorSimilarity: 0.9,
    termSimilarity: 0.1,
  },
  {
    id: "chunk-2",
    content: "不应出现的内容",
    documentId: "rf-doc-2",
    documentKeyword: "",
    similarity: 0.8,
    vectorSimilarity: 0.8,
    termSimilarity: 0.1,
  },
  {
    id: "chunk-x",
    content: "不在授权范围内的片段",
    documentId: "rf-doc-x",
    documentKeyword: "",
    similarity: 0.99,
    vectorSimilarity: 0.99,
    termSimilarity: 0.1,
  },
];

function createContext() {
  const accessClient = {
    async scope() {
      return {
        knowledgeBases: [
          {
            id: "kb-1",
            name: "内部制度",
            ragflowDatasetId: "ds-1",
            documents: [
              { id: "doc-1", title: "差旅制度.pdf", ragflowDocumentId: "rf-doc-1" },
              { id: "doc-2", title: "受限文档.pdf", ragflowDocumentId: "rf-doc-2" },
            ],
          },
        ],
      };
    },
    async check(_principal: unknown, documentId: string) {
      return documentId === "doc-1"
        ? { allowed: true, reason: "allowed" as const }
        : { allowed: false, reason: "explicit_deny" as const };
    },
  } as unknown as AccessClient;

  const ragflow = {
    async retrieve() {
      return chunks;
    },
  } as unknown as RAGFlowClient;

  return {
    principal: {
      tenantId: "tenant-1",
      userId: "user-1",
      role: "member" as const,
      groupIds: [],
    },
    accessClient,
    ragflow,
    citations: new CitationRegistry("msg-1"),
    config,
  };
}

describe("kb_search tool", () => {
  it("filters chunks by document id and re-checks ACL", async () => {
    const context = createContext();
    const tool = createKbSearchTool(context);

    const result = await tool.execute(
      "call-1",
      { query: "住宿标准", topK: 5 },
      undefined,
      undefined,
      undefined as never,
    );
    const details = result.details as KbToolDetails;

    expect(details.citations).toHaveLength(1);
    expect(details.citations[0]).toMatchObject({
      documentId: "doc-1",
      documentTitle: "差旅制度.pdf",
      index: 1,
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("[1]"),
    });
    expect(JSON.stringify(result)).not.toContain("rf-doc-1");
    expect(JSON.stringify(result.content)).not.toContain("不应出现的内容");
  });

  it("returns an empty result when the user has no readable documents", async () => {
    const context = {
      ...createContext(),
      accessClient: {
        async scope() {
          return { knowledgeBases: [] };
        },
        async check() {
          return { allowed: false, reason: "no_grant" as const };
        },
      } as unknown as AccessClient,
    };
    const tool = createKbSearchTool(context);
    const result = await tool.execute(
      "call-2",
      { query: "任何问题" },
      undefined,
      undefined,
      undefined as never,
    );

    expect(result.details).toMatchObject({ citations: [] });
    expect(result.content[0]).toMatchObject({ type: "text" });
  });
});
