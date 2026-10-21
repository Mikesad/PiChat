import type { Job } from "bullmq";
import type { IngestionJob, IngestionResult } from "../queues.js";

export async function processIngestion(job: Job<IngestionJob>): Promise<IngestionResult> {
  return {
    documentId: job.data.documentId,
    status: "accepted",
  };
}
