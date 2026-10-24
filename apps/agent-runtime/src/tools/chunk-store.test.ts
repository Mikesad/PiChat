import type { RAGFlowChunk, RAGFlowClient } from "@pichat/ragflow-client";
import { describe, expect, it } from "vitest";
import { ChunkStore } from "./chunk-store.js";

function chunk(index: number, rowId = index): RAGFlowChunk {
  return {
    id: `chunk-${index}`,
    content: `内容 ${index}`,
    documentId: "rf-doc-1",
    documentKeyword: "policy",
    positions: [],
    available: true,
    rowId,
  };
}

function createRagflow(total: number) {
  const calls: Array<{ page: number; pageSize: number }> = [];
  const all = Array.from({ length: total }, (_, index) => chunk(index + 1, total - index));
  const ragflow = {
    async listChunks(
      _datasetId: string,
      _documentId: string,
      input: { page?: number; pageSize?: number } = {},
    ) {
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 100;
      calls.push({ page, pageSize });
      return {
        chunks: all.slice((page - 1) * pageSize, page * pageSize),
        total,
        chunkMethod: "naive",
      };
    },
  } as unknown as RAGFlowClient;
  return { ragflow, calls, all };
}

describe("ChunkStore", () => {
  it("loads and caches all pages of a document", async () => {
    const { ragflow, calls } = createRagflow(150);
    const store = new ChunkStore(ragflow);

    const first = await store.load("ds-1", "rf-doc-1");
    const second = await store.load("ds-1", "rf-doc-1");

    expect(first.chunks).toHaveLength(150);
    expect(first.chunks[0]?.content).toBe("内容 150");
    expect(first.chunks[149]?.content).toBe("内容 1");
    expect(first.total).toBe(150);
    expect(first.truncated).toBe(false);
    expect(second).toBe(first);
    expect(calls).toEqual([
      { page: 1, pageSize: 100 },
      { page: 2, pageSize: 100 },
    ]);
  });

  it("fails clearly when RAGFlow is not configured", async () => {
    const store = new ChunkStore(null);

    await expect(store.load("ds-1", "rf-doc-1")).rejects.toMatchObject({
      code: "ragflow_not_configured",
    });
  });
});
