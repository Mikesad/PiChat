import { createDatabase } from "@pichat/db";
import { createWorkerRedisOptions, INGESTION_QUEUE, type IngestionJob } from "@pichat/queue";
import { RAGFlowClient } from "@pichat/ragflow-client";
import { Worker } from "bullmq";
import dotenv from "dotenv";
import { Redis } from "ioredis";
import { loadIngestionConfig } from "./config.js";
import { processIngestion } from "./jobs/ingest.js";

dotenv.config({ path: process.env.ENV_FILE ?? "../../.env" });

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const ragflowBaseUrl = process.env.RAGFLOW_BASE_URL;
  const ragflowApiKey = process.env.RAGFLOW_API_KEY;
  if (!ragflowBaseUrl || !ragflowApiKey) {
    throw new Error("RAGFLOW_BASE_URL and RAGFLOW_API_KEY must be configured");
  }

  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const connection = new Redis(createWorkerRedisOptions(redisUrl));
  connection.on("error", () => {
    console.error("Redis connection error");
  });
  try {
    await connection.ping();
  } catch {
    await connection.quit();
    throw new Error(`Cannot connect to Redis at ${new URL(redisUrl).host}`);
  }

  const db = createDatabase(databaseUrl);
  const client = new RAGFlowClient({ baseUrl: ragflowBaseUrl, apiKey: ragflowApiKey });
  const config = loadIngestionConfig();

  if (!config.embeddingModel) {
    console.warn(
      "RAGFLOW_DEFAULT_EMBEDDING_MODEL is not configured; existing datasets can still be used, creating a new dataset will fail",
    );
  }

  const worker = new Worker<IngestionJob>(
    INGESTION_QUEUE,
    (job) =>
      processIngestion(job, {
        db,
        client,
        config,
        logger: (event) => {
          console.log(JSON.stringify(event));
        },
      }),
    {
      connection,
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
    },
  );

  worker.on("completed", (job) => {
    console.log(JSON.stringify({ event: "job_completed", jobId: job.id }));
  });

  worker.on("failed", (job, error) => {
    console.error(
      JSON.stringify({
        event: "job_failed",
        jobId: job?.id ?? "unknown",
        message: error.message,
      }),
    );
  });

  const shutdown = async () => {
    await worker.close();
    await connection.quit();
    await db.$client.end();
  };

  process.on("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });

  console.log(JSON.stringify({ event: "worker_started", queue: INGESTION_QUEUE }));
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  console.error(JSON.stringify({ event: "worker_start_failed", message }));
  process.exitCode = 1;
});
