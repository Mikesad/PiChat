import type { RAGFlowChunk, RAGFlowClient } from "@pichat/ragflow-client";
import { ToolExecutionError } from "./types.js";

const PAGE_SIZE = 100;
const MAX_DOCUMENT_CHUNKS = 2_000;
const MAX_CACHED_DOCUMENTS = 8;

export interface DocumentChunkSnapshot {
  chunks: RAGFlowChunk[];
  total: number;
  chunkMethod: string | null;
  truncated: boolean;
}

export class ChunkStore {
  private readonly cache = new Map<string, Promise<DocumentChunkSnapshot>>();

  constructor(private readonly ragflow: RAGFlowClient | null) {}

  async load(datasetId: string, documentId: string): Promise<DocumentChunkSnapshot> {
    if (!this.ragflow) {
      throw new ToolExecutionError("ragflow_not_configured", "知识库检索服务未配置");
    }
    if (!datasetId || !documentId) {
      throw new ToolExecutionError("document_not_found", "文档缺少可读取的索引信息");
    }

    const key = `${datasetId}:${documentId}`;
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    if (this.cache.size >= MAX_CACHED_DOCUMENTS) {
      const oldest = this.cache.keys().next().value;
      if (oldest) {
        this.cache.delete(oldest);
      }
    }

    const promise = this.fetchDocument(datasetId, documentId);
    this.cache.set(key, promise);
    try {
      return await promise;
    } catch (error) {
      this.cache.delete(key);
      throw error;
    }
  }

  private async fetchDocument(
    datasetId: string,
    documentId: string,
  ): Promise<DocumentChunkSnapshot> {
    const first = await this.ragflow?.listChunks(datasetId, documentId, {
      page: 1,
      pageSize: PAGE_SIZE,
    });
    if (!first) {
      throw new ToolExecutionError("ragflow_not_configured", "知识库检索服务未配置");
    }

    const chunks = [...first.chunks];
    const target = Math.min(Math.max(first.total, chunks.length), MAX_DOCUMENT_CHUNKS);
    let page = 1;

    while (chunks.length < target && first.chunks.length === PAGE_SIZE) {
      page += 1;
      const next = await this.ragflow?.listChunks(datasetId, documentId, {
        page,
        pageSize: PAGE_SIZE,
      });
      if (!next || next.chunks.length === 0) {
        break;
      }
      chunks.push(...next.chunks);
      if (next.chunks.length < PAGE_SIZE) {
        break;
      }
    }

    const visible = chunks.slice(0, MAX_DOCUMENT_CHUNKS);
    if (visible.length > 0 && visible.every((chunk) => chunk.rowId !== undefined)) {
      visible.sort((left, right) => (left.rowId ?? 0) - (right.rowId ?? 0));
    }
    const total = first.total > 0 ? first.total : visible.length;
    return {
      chunks: visible,
      total,
      chunkMethod: first.chunkMethod,
      truncated: total > visible.length,
    };
  }
}
