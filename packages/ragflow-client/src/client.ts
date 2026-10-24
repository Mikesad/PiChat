import type {
  ChunkListInput,
  ChunkListResult,
  CreateDatasetInput,
  DocumentListInput,
  RAGFlowChunk,
  RAGFlowDataset,
  RAGFlowDocument,
  RAGFlowEnvelope,
  RAGFlowOptions,
  RAGFlowParseState,
  RawRAGFlowChunk,
  RawRAGFlowDataset,
  RawRAGFlowDocument,
  RawRetrievalChunk,
  RetrievalChunk,
  RetrievalInput,
  UploadDocumentInput,
} from "./types.js";

export class RAGFlowError extends Error {
  readonly status: number;
  readonly code: number;

  constructor(message: string, status: number, code: number) {
    super(message);
    this.name = "RAGFlowError";
    this.status = status;
    this.code = code;
  }
}

function listFromData<T>(data: unknown, keys: string[]): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }
  if (data && typeof data === "object") {
    for (const key of keys) {
      const value = (data as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        return value as T[];
      }
    }
  }
  return [];
}

export function toParseState(raw: RawRAGFlowDocument): RAGFlowParseState {
  const ingestionStatus = raw.ingestion_status?.toUpperCase();
  if (ingestionStatus === "COMPLETED") {
    return "ready";
  }
  if (ingestionStatus === "FAILED" || ingestionStatus === "STOPPED") {
    return "failed";
  }
  if (ingestionStatus === "RUNNING" || ingestionStatus === "STOPPING") {
    return "parsing";
  }
  if (ingestionStatus === "CREATED" || ingestionStatus === "SCHEDULED") {
    return "pending";
  }

  const run = raw.run?.toUpperCase();
  if (run === "DONE") {
    return "ready";
  }
  if (run === "FAIL" || run === "CANCEL") {
    return "failed";
  }
  if (run === "RUNNING") {
    return "parsing";
  }

  const status = typeof raw.status === "number" ? raw.status : Number(raw.status);
  if (status === 3) {
    return "ready";
  }
  if (status === 4 || status === 2) {
    return "failed";
  }
  if (status === 1) {
    return "parsing";
  }
  return "pending";
}

function toDocument(raw: RawRAGFlowDocument): RAGFlowDocument {
  return {
    id: raw.id ?? "",
    name: raw.name ?? "",
    run: raw.run ?? null,
    progress: typeof raw.progress === "number" ? raw.progress : 0,
    state: toParseState(raw),
    errorMessage: raw.run_error_msg ?? raw.progress_msg ?? raw.message ?? null,
  };
}

function toDataset(raw: RawRAGFlowDataset): RAGFlowDataset {
  return {
    id: raw.id ?? "",
    name: raw.name ?? "",
    embeddingModel: raw.embedding_model ?? null,
  };
}

function toPositions(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toChunk(raw: RawRAGFlowChunk, fallbackDocumentId = ""): RAGFlowChunk {
  const rowId = raw["row_id()"] ?? raw.row_id;
  return {
    id: raw.id ?? raw.chunk_id ?? "",
    content: raw.content ?? raw.content_with_weight ?? "",
    documentId: raw.document_id ?? fallbackDocumentId,
    documentKeyword: raw.docnm_kwd ?? raw.document_keyword ?? "",
    positions: toPositions(raw.positions),
    available: raw.available ?? (raw.available_int ?? 1) !== 0,
    ...(typeof rowId === "number" ? { rowId } : {}),
  };
}

function toChunkListResult(data: unknown, documentId: string): ChunkListResult {
  const record =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const chunks = listFromData<RawRAGFlowChunk>(data, ["chunks"]).map((chunk) =>
    toChunk(chunk, documentId),
  );
  const doc =
    record.doc && typeof record.doc === "object" && !Array.isArray(record.doc)
      ? (record.doc as Record<string, unknown>)
      : {};
  const total =
    typeof doc.chunk_count === "number"
      ? doc.chunk_count
      : typeof doc.chunk_count === "string"
        ? Number(doc.chunk_count)
        : chunks.length;
  return {
    chunks,
    total: Number.isFinite(total) ? total : chunks.length,
    chunkMethod: typeof doc.chunk_method === "string" ? doc.chunk_method : null,
  };
}

export class RAGFlowClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options: RAGFlowOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${this.apiKey}`);
      if (typeof init?.body === "string" && !headers.has("content-type")) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });

      const text = await response.text();
      let payload: RAGFlowEnvelope<T> | null = null;
      try {
        payload = text.length > 0 ? (JSON.parse(text) as RAGFlowEnvelope<T>) : null;
      } catch {
        throw new RAGFlowError(
          `RAGFlow returned a non-JSON response (status ${response.status})`,
          response.status,
          -1,
        );
      }

      if (!response.ok || !payload || payload.code !== 0) {
        throw new RAGFlowError(
          payload?.message ?? `RAGFlow request failed with status ${response.status}`,
          response.status,
          payload?.code ?? -1,
        );
      }

      return payload.data as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async health(): Promise<unknown> {
    return this.request("/api/v1/system/healthz");
  }

  async listDatasets(): Promise<RAGFlowDataset[]> {
    const datasets: RAGFlowDataset[] = [];
    for (let page = 1; page <= 20; page += 1) {
      const data = await this.request<unknown>(`/api/v1/datasets?page=${page}&page_size=100`);
      const items = listFromData<RawRAGFlowDataset>(data, ["datasets", "docs"]);
      datasets.push(...items.map(toDataset));
      if (items.length < 100) {
        break;
      }
    }
    return datasets;
  }

  async getDataset(datasetId: string): Promise<RAGFlowDataset | null> {
    const datasets = await this.listDatasets();
    return datasets.find((dataset) => dataset.id === datasetId) ?? null;
  }

  async createDataset(input: CreateDatasetInput): Promise<RAGFlowDataset> {
    const base = {
      name: input.name,
      embedding_model: input.embeddingModel,
    };
    const parserId = input.chunkMethod ?? "naive";

    let data: RawRAGFlowDataset;
    try {
      data = await this.request<RawRAGFlowDataset>("/api/v1/datasets", {
        method: "POST",
        body: JSON.stringify({
          ...base,
          parse_type: 1,
          parser_id: parserId,
        }),
      });
    } catch (cause) {
      if (
        cause instanceof RAGFlowError &&
        /parse_type|parser_id|chunk_method/i.test(cause.message)
      ) {
        data = await this.request<RawRAGFlowDataset>("/api/v1/datasets", {
          method: "POST",
          body: JSON.stringify({
            ...base,
            chunk_method: parserId,
          }),
        });
      } else {
        throw cause;
      }
    }

    const dataset = toDataset(data ?? {});
    if (!dataset.id) {
      throw new RAGFlowError("RAGFlow did not return a dataset id", 200, -1);
    }
    return dataset;
  }

  async deleteDataset(datasetId: string): Promise<void> {
    try {
      await this.request<unknown>("/api/v1/datasets", {
        method: "DELETE",
        body: JSON.stringify({ ids: [datasetId] }),
      });
    } catch (cause) {
      if (cause instanceof RAGFlowError && cause.status === 404) {
        return;
      }
      throw cause;
    }
  }

  async uploadDocument(datasetId: string, input: UploadDocumentInput): Promise<RAGFlowDocument> {
    const copy = new Uint8Array(input.data.length);
    copy.set(input.data);
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([copy], { type: input.mimeType || "application/octet-stream" }),
      input.fileName,
    );

    const data = await this.request<unknown>(
      `/api/v1/datasets/${encodeURIComponent(datasetId)}/documents`,
      { method: "POST", body: formData },
    );
    const document = listFromData<RawRAGFlowDocument>(data, ["documents", "docs"]).map(
      toDocument,
    )[0];
    if (!document?.id) {
      throw new RAGFlowError("RAGFlow did not return a document id", 200, -1);
    }
    return document;
  }

  async listDocuments(
    datasetId: string,
    input: DocumentListInput = {},
  ): Promise<RAGFlowDocument[]> {
    const params = new URLSearchParams({
      page: String(input.page ?? 1),
      page_size: String(input.pageSize ?? 100),
    });
    if (input.documentId) {
      params.set("id", input.documentId);
    }
    if (input.keywords) {
      params.set("keywords", input.keywords);
    }

    const data = await this.request<unknown>(
      `/api/v1/datasets/${encodeURIComponent(datasetId)}/documents?${params.toString()}`,
    );
    return listFromData<RawRAGFlowDocument>(data, ["documents", "docs"]).map(toDocument);
  }

  async getDocument(datasetId: string, documentId: string): Promise<RAGFlowDocument | null> {
    const documents = await this.listDocuments(datasetId, {
      documentId,
      pageSize: 100,
    });
    return documents.find((document) => document.id === documentId) ?? null;
  }

  async listChunks(
    datasetId: string,
    documentId: string,
    input: ChunkListInput = {},
  ): Promise<ChunkListResult> {
    const params = new URLSearchParams({
      page: String(input.page ?? 1),
      page_size: String(input.pageSize ?? 100),
    });
    if (input.chunkId) {
      params.set("id", input.chunkId);
    }
    if (input.keywords) {
      params.set("keywords", input.keywords);
    }

    const data = await this.request<unknown>(
      `/api/v1/datasets/${encodeURIComponent(datasetId)}/documents/${encodeURIComponent(documentId)}/chunks?${params.toString()}`,
    );
    return toChunkListResult(data, documentId);
  }

  async getChunk(
    datasetId: string,
    documentId: string,
    chunkId: string,
  ): Promise<RAGFlowChunk | null> {
    const data = await this.request<unknown>(
      `/api/v1/datasets/${encodeURIComponent(datasetId)}/documents/${encodeURIComponent(documentId)}/chunks/${encodeURIComponent(chunkId)}`,
    );
    if (Array.isArray(data)) {
      return data.length > 0 ? toChunk(data[0] as RawRAGFlowChunk, documentId) : null;
    }
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      if (record.chunk && typeof record.chunk === "object") {
        return toChunk(record.chunk as RawRAGFlowChunk, documentId);
      }
      if (typeof record.id === "string" || typeof record.chunk_id === "string") {
        return toChunk(record as RawRAGFlowChunk, documentId);
      }
    }
    return null;
  }

  async parseDocuments(datasetId: string, documentIds: string[]): Promise<void> {
    await this.request<unknown>(`/api/v1/datasets/${encodeURIComponent(datasetId)}/chunks`, {
      method: "POST",
      body: JSON.stringify({ document_ids: documentIds }),
    });
  }

  async deleteDocument(datasetId: string, documentId: string): Promise<void> {
    try {
      await this.request<unknown>(`/api/v1/datasets/${encodeURIComponent(datasetId)}/documents`, {
        method: "DELETE",
        body: JSON.stringify({ ids: [documentId] }),
      });
    } catch (cause) {
      if (cause instanceof RAGFlowError && cause.status === 404) {
        return;
      }
      throw cause;
    }
  }

  async retrieve(input: RetrievalInput): Promise<RetrievalChunk[]> {
    const data = await this.request<{ chunks?: RawRetrievalChunk[] }>("/api/v1/retrieval", {
      method: "POST",
      body: JSON.stringify({
        question: input.question,
        dataset_ids: input.datasetIds,
        document_ids: input.documentIds ?? [],
        page: 1,
        page_size: input.topK ?? 30,
        similarity_threshold: input.similarityThreshold ?? 0.2,
        vector_similarity_weight: input.vectorSimilarityWeight ?? 0.3,
        ...(input.rerankId ? { rerank_id: input.rerankId } : {}),
        top_k: 1024,
      }),
    });

    return (data.chunks ?? []).map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      documentId: chunk.document_id,
      documentKeyword: chunk.document_keyword ?? "",
      similarity: chunk.similarity ?? 0,
      vectorSimilarity: chunk.vector_similarity ?? 0,
      termSimilarity: chunk.term_similarity ?? 0,
    }));
  }
}
