import type { RAGFlowChunk, RAGFlowClient } from "@pichat/ragflow-client";
import type { AccessScopeKnowledgeBase } from "@pichat/shared";
import { describe, expect, it } from "vitest";
import type { AccessClient } from "../clients/access-client.js";
import type { RuntimeConfig } from "../config.js";
import { CitationRegistry } from "../runtime/citation-registry.js";
import { ChunkStore } from "./chunk-store.js";
import { DocumentRegistry } from "./document-registry.js";
import { createKbDocumentOutlineTool } from "./kb-document-outline.js";
import { createKbFindInDocumentTool } from "./kb-find-in-document.js";
import { createKbListScopeTool } from "./kb-list-scope.js";
import { createKbReadAroundTool } from "./kb-read-around.js";
import type { KbToolDetails, ToolRuntimeContext } from "./types.js";

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
    answerSimilarityThreshold: 0.35,
    highSimilarityThreshold: 0.6,
    vectorWeight: 0.3,
    maxSnippetChars: 1200,
    maxResultChars: 12_000,
  },
  model: { contextWindow: 128_000, maxTokens: 8192 },
  webSearch: { provider: "bocha", apiKey: "", maxResults: 5 },
};

const knowledgeBase: AccessScopeKnowledgeBase = {
  id: "kb-1",
  name: "内部制度",
  ragflowDatasetId: "ds-1",
  retrieval: { topK: 6, similarityThreshold: 0.2, vectorWeight: 0.3 },
  documents: [{ id: "doc-1", title: "差旅制度.pdf", ragflowDocumentId: "rf-doc-1" }],
};

function chunk(id: string, content: string): RAGFlowChunk {
  return {
    id,
    content,
    documentId: "rf-doc-1",
    documentKeyword: "差旅制度",
    positions: [],
    available: true,
  };
}

function createRagflow(chunks: RAGFlowChunk[]): RAGFlowClient {
  return {
    async listChunks(
      _datasetId: string,
      _documentId: string,
      input?: { page?: number; pageSize?: number },
    ) {
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 100;
      return {
        chunks: chunks.slice((page - 1) * pageSize, page * pageSize),
        total: chunks.length,
        chunkMethod: "naive",
      };
    },
  } as unknown as RAGFlowClient;
}

function createContext(
  chunks: RAGFlowChunk[],
  options: { allowed?: boolean; scopeHasDocument?: boolean } = {},
): ToolRuntimeContext {
  const ragflow = createRagflow(chunks);
  const allowed = options.allowed ?? true;
  const scopeHasDocument = options.scopeHasDocument ?? true;
  const accessClient = {
    async scope() {
      return {
        knowledgeBases: [
          {
            ...knowledgeBase,
            documents: scopeHasDocument ? knowledgeBase.documents : [],
          },
        ],
      };
    },
    async check() {
      return allowed
        ? { allowed: true, reason: "allowed" as const }
        : { allowed: false, reason: "explicit_deny" as const };
    },
  } as unknown as AccessClient;

  return {
    principal: {
      tenantId: "tenant-1",
      userId: "user-1",
    },
    accessClient,
    ragflow,
    citations: new CitationRegistry("msg-1"),
    documents: new DocumentRegistry(),
    chunks: new ChunkStore(ragflow),
    config,
  };
}

function registerDocumentHandle(context: ToolRuntimeContext): string {
  const document = knowledgeBase.documents[0];
  if (!document) {
    throw new Error("test knowledge base must have a document");
  }
  return context.documents.register(document, knowledgeBase).handle;
}

function registerCitation(context: ToolRuntimeContext, chunkId: string): number {
  return context.citations.add({
    documentId: "doc-1",
    documentTitle: "差旅制度.pdf",
    knowledgeBaseId: "kb-1",
    knowledgeBaseName: "内部制度",
    chunkId,
    snippet: "已检索片段",
    ragflowDocumentId: "rf-doc-1",
  }).citation.index;
}

describe("kb_list_scope tool", () => {
  it("lists readable documents and registers run-scoped handles without leaking internal ids", async () => {
    const context = createContext([]);
    const tool = createKbListScopeTool(context);

    const result = await tool.execute("call-list", {}, undefined, undefined, undefined as never);
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("<kb_scope>");
    expect(text).toContain("内部制度");
    expect(text).toContain("D1");
    expect(text).toContain("差旅制度.pdf");
    expect(text).not.toContain("rf-doc-1");
    expect(text).not.toContain("doc-1");
    expect(context.documents.get("D1")?.document.id).toBe("doc-1");
    expect((result.details as KbToolDetails).citations).toEqual([]);
  });

  it("filters by title and reports empty scopes", async () => {
    const context = createContext([]);
    const tool = createKbListScopeTool(context);

    const hit = await tool.execute(
      "call-filter",
      { query: "差旅" },
      undefined,
      undefined,
      undefined as never,
    );
    expect((hit.content[0] as { text: string }).text).toContain("差旅制度.pdf");

    const miss = await tool.execute(
      "call-miss",
      { query: "合同" },
      undefined,
      undefined,
      undefined as never,
    );
    expect((miss.content[0] as { text: string }).text).toContain("没有匹配");
  });
});

describe("kb_read_around tool", () => {
  const chunks = [
    chunk("c1", "第一章 总则"),
    chunk("c2", "住宿标准：一线城市每人每晚 650 元。"),
    chunk("c3", "报销需在出差结束后 30 天内提交。"),
  ];

  it("reads the citation target plus adjacent chunks and registers citations", async () => {
    const context = createContext(chunks);
    const citation = registerCitation(context, "c2");
    const tool = createKbReadAroundTool(context);

    const result = await tool.execute(
      "call-around",
      { citation, before: 1, after: 1 },
      undefined,
      undefined,
      undefined as never,
    );
    const text = (result.content[0] as { text: string }).text;
    const details = result.details as KbToolDetails;

    expect(text).toContain("片段 1：第一章 总则");
    expect(text).toContain("片段 2：住宿标准");
    expect(text).toContain("650");
    expect(text).toContain("30 天");
    expect(text).toContain('confidence="adjacent"');
    expect(details.citations).toHaveLength(3);
    expect(details.citations.map((item) => item.chunkId)).toEqual(["c1", "c2", "c3"]);
    expect(details.citations.map((item) => item.index).sort()).toEqual([1, 2, 3]);
  });

  it("reads from a document handle and chunk index", async () => {
    const context = createContext(chunks);
    const handle = registerDocumentHandle(context);
    const tool = createKbReadAroundTool(context);

    const result = await tool.execute(
      "call-doc",
      { document: handle, chunkIndex: 2, before: 0, after: 0 },
      undefined,
      undefined,
      undefined as never,
    );
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("650");
    expect(text).not.toContain("第一章");
    expect((result.details as KbToolDetails).citations).toHaveLength(1);
  });

  it("reports stale citations instead of re-searching", async () => {
    const context = createContext(chunks);
    const citation = registerCitation(context, "removed-chunk");
    const tool = createKbReadAroundTool(context);

    await expect(
      tool.execute("call-stale", { citation }, undefined, undefined, undefined as never),
    ).rejects.toMatchObject({ code: "citation_stale" });
  });

  it("denies reading when ACL check fails", async () => {
    const context = createContext(chunks, { allowed: false });
    const citation = registerCitation(context, "c2");
    const tool = createKbReadAroundTool(context);

    await expect(
      tool.execute("call-denied", { citation }, undefined, undefined, undefined as never),
    ).rejects.toMatchObject({ code: "access_revoked" });
  });

  it("requires exactly one of citation or document", async () => {
    const context = createContext(chunks);
    const handle = registerDocumentHandle(context);
    const citation = registerCitation(context, "c2");
    const tool = createKbReadAroundTool(context);

    await expect(
      tool.execute(
        "call-both",
        { citation, document: handle },
        undefined,
        undefined,
        undefined as never,
      ),
    ).rejects.toMatchObject({ code: "invalid_arguments" });
  });
});

describe("kb_find_in_document tool", () => {
  const chunks = [
    chunk("c1", "合同编号：HT-2024-001。付款方式为分期付款。"),
    chunk("c2", "错误码 E-1024 表示参数校验失败。"),
    chunk("c3", "型号 ABC 与 A.C 不是同一个产品。"),
  ];

  it("finds literal identifiers and registers exact citations", async () => {
    const context = createContext(chunks);
    const handle = registerDocumentHandle(context);
    const tool = createKbFindInDocumentTool(context);

    const result = await tool.execute(
      "call-find",
      { query: "E-1024", document: handle },
      undefined,
      undefined,
      undefined as never,
    );
    const text = (result.content[0] as { text: string }).text;
    const details = result.details as KbToolDetails;

    expect(text).toContain("E-1024");
    expect(text).toContain('confidence="exact"');
    expect(details.citations).toHaveLength(1);
    expect(details.citations[0]?.chunkId).toBe("c2");
  });

  it("treats regex metacharacters as literal text", async () => {
    const context = createContext(chunks);
    const handle = registerDocumentHandle(context);
    const tool = createKbFindInDocumentTool(context);

    const result = await tool.execute(
      "call-literal",
      { query: "A.C", document: handle },
      undefined,
      undefined,
      undefined as never,
    );
    const details = result.details as KbToolDetails;

    expect(details.citations).toHaveLength(1);
    expect(details.citations[0]?.chunkId).toBe("c3");
  });

  it("returns no citations when nothing matches", async () => {
    const context = createContext(chunks);
    const handle = registerDocumentHandle(context);
    const tool = createKbFindInDocumentTool(context);

    const result = await tool.execute(
      "call-none",
      { query: "不存在的编号", document: handle },
      undefined,
      undefined,
      undefined as never,
    );

    expect((result.details as KbToolDetails).citations).toHaveLength(0);
    expect((result.content[0] as { text: string }).text).toContain("没有找到");
  });
});

describe("kb_document_outline tool", () => {
  it("extracts inferred headings with chunk positions", async () => {
    const context = createContext([
      chunk("c1", "# 员工手册\n欢迎阅读。"),
      chunk("c2", "## 考勤制度\n每天 9:00 上班。"),
      chunk("c3", "## 请假流程\n提前在系统提交申请。"),
    ]);
    const handle = registerDocumentHandle(context);
    const tool = createKbDocumentOutlineTool(context);

    const result = await tool.execute(
      "call-outline",
      { document: handle },
      undefined,
      undefined,
      undefined as never,
    );
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("员工手册");
    expect(text).toContain("考勤制度（片段 2");
    expect(text).toContain("请假流程（片段 3");
    expect((result.details as KbToolDetails).citations).toEqual([]);
  });

  it("extracts multiple headings from the same chunk", async () => {
    const context = createContext([
      chunk("c1", "# 员工手册\n## 总则\n本手册适用于全体员工。\n## 适用范围\n适用于全职员工。"),
    ]);
    const handle = registerDocumentHandle(context);
    const tool = createKbDocumentOutlineTool(context);

    const result = await tool.execute(
      "call-outline-multi",
      { document: handle },
      undefined,
      undefined,
      undefined as never,
    );
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("员工手册（片段 1");
    expect(text).toContain("总则（片段 1");
    expect(text).toContain("适用范围（片段 1");
  });

  it("falls back to chunk openings when no headings are detected", async () => {
    const context = createContext([chunk("c1", "普通正文第一行\n第二行")]);
    const handle = registerDocumentHandle(context);
    const tool = createKbDocumentOutlineTool(context);

    const result = await tool.execute(
      "call-outline-fallback",
      { document: handle },
      undefined,
      undefined,
      undefined as never,
    );
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain("没有识别到稳定的章节标题");
    expect(text).toContain("普通正文第一行");
  });

  it("denies outline when the document is no longer in scope", async () => {
    const context = createContext([chunk("c1", "# 标题")], { scopeHasDocument: false });
    const handle = registerDocumentHandle(context);
    const tool = createKbDocumentOutlineTool(context);

    await expect(
      tool.execute(
        "call-outline-denied",
        { document: handle },
        undefined,
        undefined,
        undefined as never,
      ),
    ).rejects.toMatchObject({ code: "access_revoked" });
  });
});
