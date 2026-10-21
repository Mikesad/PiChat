import type {
  RAGFlowEnvelope,
  RAGFlowOptions,
  RawRetrievalChunk,
  RetrievalChunk,
  RetrievalInput,
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
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
        signal: controller.signal,
      });

      const payload = (await response.json()) as RAGFlowEnvelope<T>;

      if (!response.ok || payload.code !== 0) {
        throw new RAGFlowError(
          payload.message ?? `RAGFlow request failed with status ${response.status}`,
          response.status,
          payload.code,
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

  async listDatasets(): Promise<unknown> {
    return this.request("/api/v1/datasets");
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
