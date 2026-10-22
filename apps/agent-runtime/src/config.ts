import { resolve } from "node:path";

export interface RuntimeConfig {
  port: number;
  internalSecret: string;
  apiInternalUrl: string;
  dataDir: string;
  runTimeoutMs: number;
  ragflow: {
    baseUrl: string;
    apiKey: string;
    timeoutMs: number;
  };
  search: {
    topK: number;
    maxTopK: number;
    similarityThreshold: number;
    maxSnippetChars: number;
    maxResultChars: number;
  };
  model: {
    contextWindow: number;
    maxTokens: number;
  };
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const internalSecret = env.INTERNAL_SHARED_SECRET?.trim();
  if (!internalSecret) {
    throw new Error("INTERNAL_SHARED_SECRET is not configured");
  }

  return {
    port: numberFromEnv(env.AGENT_RUNTIME_PORT, 3002),
    internalSecret,
    apiInternalUrl: (env.API_INTERNAL_URL ?? "http://127.0.0.1:3001").replace(/\/+$/, ""),
    dataDir: resolve(env.AGENT_RUNTIME_DATA_DIR ?? ".runtime-data"),
    runTimeoutMs: numberFromEnv(env.AGENT_RUN_TIMEOUT_MS, 300_000),
    ragflow: {
      baseUrl: env.RAGFLOW_BASE_URL?.trim() ?? "",
      apiKey: env.RAGFLOW_API_KEY?.trim() ?? "",
      timeoutMs: numberFromEnv(env.RAGFLOW_TIMEOUT_MS, 30_000),
    },
    search: {
      topK: numberFromEnv(env.KB_SEARCH_TOP_K, 6),
      maxTopK: numberFromEnv(env.KB_SEARCH_MAX_TOP_K, 12),
      similarityThreshold: Number(env.KB_SEARCH_SIMILARITY_THRESHOLD ?? "0.2"),
      maxSnippetChars: numberFromEnv(env.KB_SEARCH_MAX_SNIPPET_CHARS, 1_200),
      maxResultChars: numberFromEnv(env.KB_SEARCH_MAX_RESULT_CHARS, 12_000),
    },
    model: {
      contextWindow: numberFromEnv(env.AGENT_MODEL_CONTEXT_WINDOW, 128_000),
      maxTokens: numberFromEnv(env.AGENT_MODEL_MAX_TOKENS, 8_192),
    },
  };
}
