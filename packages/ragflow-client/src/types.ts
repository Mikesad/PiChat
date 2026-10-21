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
