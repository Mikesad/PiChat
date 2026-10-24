import { afterEach, describe, expect, it, vi } from "vitest";
import { RAGFlowClient, toParseState } from "./client.js";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ code: 0, data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("RAGFlow client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads multipart form data without forcing a JSON content type", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse([{ id: "rf-doc-1", name: "policy.pdf" }]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new RAGFlowClient({ baseUrl: "http://ragflow", apiKey: "secret" });
    const document = await client.uploadDocument("ds-1", {
      fileName: "policy.pdf",
      mimeType: "application/pdf",
      data: new TextEncoder().encode("%PDF-1.4"),
    });

    expect(document.id).toBe("rf-doc-1");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toBeNull();
    expect(headers.get("authorization")).toBe("Bearer secret");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("maps RAGFlow run/status values to parse states", () => {
    expect(toParseState({ run: "DONE" })).toBe("ready");
    expect(toParseState({ run: "RUNNING" })).toBe("parsing");
    expect(toParseState({ run: "FAIL" })).toBe("failed");
    expect(toParseState({ status: 0 })).toBe("pending");
    expect(toParseState({ status: 1 })).toBe("parsing");
    expect(toParseState({ status: 3 })).toBe("ready");
    expect(toParseState({ status: 4 })).toBe("failed");
  });

  it("maps RAGFlow v1 ingestion_status values", () => {
    expect(toParseState({ ingestion_status: "COMPLETED", status: "1" })).toBe("ready");
    expect(toParseState({ ingestion_status: "FAILED", status: "1" })).toBe("failed");
    expect(toParseState({ ingestion_status: "RUNNING", status: "1" })).toBe("parsing");
    expect(toParseState({ ingestion_status: "SCHEDULED", status: "1" })).toBe("pending");
  });

  it("deletes a dataset with a JSON body", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(true),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new RAGFlowClient({ baseUrl: "http://ragflow", apiKey: "secret" });
    await client.deleteDataset("ds-1");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://ragflow/api/v1/datasets");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(String(init.body))).toEqual({ ids: ["ds-1"] });
  });

  it("treats a 404 dataset deletion as idempotent success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 102, message: "Dataset not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const client = new RAGFlowClient({ baseUrl: "http://ragflow", apiKey: "secret" });
    await expect(client.deleteDataset("ds-missing")).resolves.toBeUndefined();
  });

  it("throws when RAGFlow rejects dataset deletion with a non-zero code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 109, message: "permission denied" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const client = new RAGFlowClient({ baseUrl: "http://ragflow", apiKey: "secret" });
    await expect(client.deleteDataset("ds-1")).rejects.toMatchObject({
      name: "RAGFlowError",
      code: 109,
    });
  });

  it("finds datasets and documents from list responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ datasets: [{ id: "ds-1", name: "Policy" }] }))
      .mockResolvedValueOnce(jsonResponse({ docs: [{ id: "rf-doc-1", run: "DONE" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RAGFlowClient({ baseUrl: "http://ragflow", apiKey: "secret" });
    expect(await client.getDataset("ds-1")).toMatchObject({ id: "ds-1" });
    expect(await client.getDocument("ds-1", "rf-doc-1")).toMatchObject({
      id: "rf-doc-1",
      state: "ready",
    });
  });

  it("lists and maps document chunks with pagination metadata", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        chunks: [
          {
            chunk_id: "chunk-1",
            content_with_weight: "第一段内容",
            docnm_kwd: "policy.pdf",
            positions: null,
            available: true,
            "row_id()": 7,
          },
        ],
        doc: { chunk_count: 12, chunk_method: "naive" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new RAGFlowClient({ baseUrl: "http://ragflow", apiKey: "secret" });
    const result = await client.listChunks("ds-1", "rf-doc-1", {
      page: 2,
      pageSize: 50,
      chunkId: "chunk-1",
      keywords: "住宿",
    });

    expect(result).toMatchObject({
      total: 12,
      chunkMethod: "naive",
      chunks: [
        {
          id: "chunk-1",
          content: "第一段内容",
          documentId: "rf-doc-1",
          documentKeyword: "policy.pdf",
          positions: [],
          available: true,
          rowId: 7,
        },
      ],
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://ragflow/api/v1/datasets/ds-1/documents/rf-doc-1/chunks?page=2&page_size=50&id=chunk-1&keywords=%E4%BD%8F%E5%AE%BF",
    );
  });

  it("sends rerank_id when a rerank model is configured", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ chunks: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new RAGFlowClient({ baseUrl: "http://ragflow", apiKey: "secret" });
    await client.retrieve({
      question: "住宿标准",
      datasetIds: ["ds-1"],
      rerankId: "BAAI/bge-reranker-v2-m3@SILICONFLOW",
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      rerank_id: "BAAI/bge-reranker-v2-m3@SILICONFLOW",
    });
  });

  it("gets a single chunk from the dedicated endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          chunk: {
            chunk_id: "chunk-1",
            content_with_weight: "片段内容",
            available: false,
          },
        }),
      ),
    );

    const client = new RAGFlowClient({ baseUrl: "http://ragflow", apiKey: "secret" });
    const chunk = await client.getChunk("ds-1", "rf-doc-1", "chunk-1");

    expect(chunk).toMatchObject({
      id: "chunk-1",
      content: "片段内容",
      documentId: "rf-doc-1",
      available: false,
    });
  });
});
