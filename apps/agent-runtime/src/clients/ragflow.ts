import { RAGFlowClient } from "@pichat/ragflow-client";
import type { RuntimeConfig } from "../config.js";

export function createRagflowClient(config: RuntimeConfig): RAGFlowClient | null {
  if (!config.ragflow.baseUrl || !config.ragflow.apiKey) {
    return null;
  }
  return new RAGFlowClient({
    baseUrl: config.ragflow.baseUrl,
    apiKey: config.ragflow.apiKey,
    timeoutMs: config.ragflow.timeoutMs,
  });
}
