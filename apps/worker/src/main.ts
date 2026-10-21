import { Worker } from "bullmq";
import dotenv from "dotenv";
import { Redis } from "ioredis";
import { processIngestion } from "./jobs/ingest.js";
import { INGESTION_QUEUE, type IngestionJob } from "./queues.js";

dotenv.config({ path: process.env.ENV_FILE ?? "../../.env" });

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const worker = new Worker<IngestionJob>(INGESTION_QUEUE, processIngestion, {
  connection,
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
});

worker.on("completed", (job) => {
  console.log(`ingestion completed: ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`ingestion failed: ${job?.id ?? "unknown"}`, error);
});

const shutdown = async () => {
  await worker.close();
  await connection.quit();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
