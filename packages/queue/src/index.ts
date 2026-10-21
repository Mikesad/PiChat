export const INGESTION_QUEUE = "ingestion";

export interface IngestionJob {
  tenantId: string;
  documentId: string;
  knowledgeBaseId: string;
}

export type IngestionStatus = "ready" | "failed" | "skipped";

export interface IngestionResult {
  documentId: string;
  status: IngestionStatus;
  reason?: string;
}

export interface RedisConnectionConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
}

export interface ProducerRedisOptions extends RedisConnectionConfig {
  maxRetriesPerRequest: number;
  enableOfflineQueue: boolean;
  connectTimeout: number;
  retryStrategy: () => null;
}

export interface WorkerRedisOptions extends RedisConnectionConfig {
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
  retryStrategy: (times: number) => number;
}

export function parseRedisConnection(redisUrl: string): RedisConnectionConfig {
  let url: URL;
  try {
    url = new URL(redisUrl);
  } catch {
    throw new Error("REDIS_URL is invalid");
  }

  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis:// or rediss://");
  }

  const db = url.pathname.replace(/^\/+/, "");
  const config: RedisConnectionConfig = {
    host: url.hostname || "127.0.0.1",
    port: url.port ? Number(url.port) : 6379,
  };
  if (url.username) {
    config.username = decodeURIComponent(url.username);
  }
  if (url.password) {
    config.password = decodeURIComponent(url.password);
  }
  if (db.length > 0) {
    const parsed = Number(db);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error("REDIS_URL database index is invalid");
    }
    config.db = parsed;
  }
  if (url.protocol === "rediss:") {
    config.tls = {};
  }

  return config;
}

export function createProducerRedisOptions(redisUrl: string): ProducerRedisOptions {
  return {
    ...parseRedisConnection(redisUrl),
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 1_500,
    retryStrategy: () => null,
  };
}

export function createWorkerRedisOptions(redisUrl: string): WorkerRedisOptions {
  return {
    ...parseRedisConnection(redisUrl),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 500, 5_000),
  };
}

export const INGESTION_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: 100,
  removeOnFail: 100,
} as const;
