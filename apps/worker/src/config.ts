import type { RAGFlowClient } from "@pichat/ragflow-client";

export interface IngestionConfig {
  embeddingModel: string;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  maxPollAttempts: number;
}

export interface IngestionClient {
  getDataset: RAGFlowClient["getDataset"];
  createDataset: RAGFlowClient["createDataset"];
  deleteDataset: RAGFlowClient["deleteDataset"];
  uploadDocument: RAGFlowClient["uploadDocument"];
  parseDocuments: RAGFlowClient["parseDocuments"];
  getDocument: RAGFlowClient["getDocument"];
  deleteDocument: RAGFlowClient["deleteDocument"];
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadIngestionConfig(env: NodeJS.ProcessEnv = process.env): IngestionConfig {
  return {
    embeddingModel: env.RAGFLOW_DEFAULT_EMBEDDING_MODEL?.trim() ?? "",
    pollIntervalMs: positiveNumber(env.RAGFLOW_POLL_INTERVAL_MS, 3_000),
    pollTimeoutMs: positiveNumber(env.RAGFLOW_POLL_TIMEOUT_MS, 300_000),
    maxPollAttempts: positiveNumber(env.RAGFLOW_POLL_MAX_ATTEMPTS, 100),
  };
}
