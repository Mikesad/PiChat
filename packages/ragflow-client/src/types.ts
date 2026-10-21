export interface RAGFlowOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface RetrievalInput {
  question: string;
  datasetIds: string[];
  documentIds?: string[];
  topK?: number;
  similarityThreshold?: number;
  vectorSimilarityWeight?: number;
}

export interface RetrievalChunk {
  id: string;
  content: string;
  documentId: string;
  documentKeyword: string;
  similarity: number;
  vectorSimilarity: number;
  termSimilarity: number;
}

export interface RAGFlowEnvelope<T> {
  code: number;
  message?: string;
  data?: T;
}

export interface RawRetrievalChunk {
  id: string;
  content: string;
  document_id: string;
  document_keyword?: string;
  similarity?: number;
  vector_similarity?: number;
  term_similarity?: number;
}

export interface CreateDatasetInput {
  name: string;
  embeddingModel: string;
  chunkMethod?: string;
  description?: string;
}

export interface RAGFlowDataset {
  id: string;
  name: string;
  embeddingModel: string | null;
}

export interface UploadDocumentInput {
  fileName: string;
  mimeType: string;
  data: Uint8Array;
}

export type RAGFlowParseState = "pending" | "parsing" | "ready" | "failed";

export interface RAGFlowDocument {
  id: string;
  name: string;
  run: string | null;
  progress: number;
  state: RAGFlowParseState;
  errorMessage: string | null;
}

export interface RawRAGFlowDataset {
  id?: string;
  name?: string;
  embedding_model?: string;
}

export interface RawRAGFlowDocument {
  id?: string;
  name?: string;
  run?: string;
  status?: string | number;
  progress?: number;
  run_error_msg?: string;
  message?: string;
}

export interface DocumentListInput {
  page?: number;
  pageSize?: number;
  documentId?: string;
  keywords?: string;
}
