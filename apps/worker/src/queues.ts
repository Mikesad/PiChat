export const INGESTION_QUEUE = "ingestion";

export interface IngestionJob {
  tenantId: string;
  documentId: string;
  knowledgeBaseId: string;
}

export interface IngestionResult {
  documentId: string;
  status: "accepted";
}
