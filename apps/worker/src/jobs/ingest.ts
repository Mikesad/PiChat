import { readFile } from "node:fs/promises";
import type { Database, Document, KnowledgeBase } from "@pichat/db";
import { documents, knowledgeBases } from "@pichat/db";
import type { IngestionJob, IngestionResult } from "@pichat/queue";
import type { Job } from "bullmq";
import { and, eq, isNull, ne } from "drizzle-orm";
import type { IngestionClient, IngestionConfig } from "../config.js";

export interface IngestionDependencies {
  db: Database;
  client: IngestionClient;
  config: IngestionConfig;
  sleep?: (ms: number) => Promise<void>;
  logger?: (event: Record<string, unknown>) => void;
}

class IngestionFailure extends Error {}

class IngestionSkipped extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

export async function processIngestion(
  job: Job<IngestionJob>,
  deps: IngestionDependencies,
): Promise<IngestionResult> {
  return runIngestion(job.data, deps);
}

export async function runIngestion(
  data: IngestionJob,
  deps: IngestionDependencies,
): Promise<IngestionResult> {
  const { tenantId, documentId } = data;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const log = deps.logger ?? (() => {});

  const document = await findDocument(deps.db, tenantId, documentId);
  if (!document) {
    log({ event: "ingestion_skipped", documentId, reason: "document_not_found" });
    return { documentId, status: "skipped", reason: "document_not_found" };
  }
  if (document.status === "ready") {
    log({ event: "ingestion_skipped", documentId, reason: "already_ready" });
    return { documentId, status: "skipped", reason: "already_ready" };
  }

  const knowledgeBase = await findKnowledgeBase(deps.db, tenantId, document.knowledgeBaseId);
  if (!knowledgeBase) {
    await markFailed(deps.db, document, "知识库不存在或已被删除");
    log({ event: "ingestion_skipped", documentId, reason: "knowledge_base_not_found" });
    return { documentId, status: "skipped", reason: "knowledge_base_not_found" };
  }

  try {
    const datasetId = await ensureDataset(knowledgeBase, deps, log);
    const ragflowDocumentId = await ensureUploaded(document, datasetId, deps, log);

    const finalState = await pollUntilFinished(document, datasetId, ragflowDocumentId, deps, sleep);
    log({ event: "ingestion_finished", documentId, status: finalState });
    return { documentId, status: finalState };
  } catch (cause) {
    if (cause instanceof IngestionSkipped) {
      log({ event: "ingestion_skipped", documentId, reason: cause.reason });
      return { documentId, status: "skipped", reason: cause.reason };
    }
    const reason = toErrorMessage(cause);
    await markFailed(deps.db, document, reason);
    log({ event: "ingestion_failed", documentId, reason });
    return { documentId, status: "failed", reason };
  }
}

async function ensureDataset(
  knowledgeBase: KnowledgeBase,
  deps: IngestionDependencies,
  log: (event: Record<string, unknown>) => void,
): Promise<string> {
  if (knowledgeBase.ragflowDatasetId) {
    try {
      const existing = await deps.client.getDataset(knowledgeBase.ragflowDatasetId);
      if (existing) {
        return existing.id;
      }
    } catch (cause) {
      throw new IngestionFailure(`无法读取 RAGFlow 数据集：${toErrorMessage(cause)}`);
    }
  }

  if (!deps.config.embeddingModel) {
    throw new IngestionFailure("缺少 RAGFLOW_DEFAULT_EMBEDDING_MODEL，无法创建 RAGFlow 数据集");
  }

  let created: { id: string };
  try {
    created = await deps.client.createDataset({
      name: knowledgeBase.name.slice(0, 120),
      embeddingModel: deps.config.embeddingModel,
      description: knowledgeBase.description ?? undefined,
    });
  } catch (cause) {
    throw new IngestionFailure(`创建 RAGFlow 数据集失败：${toErrorMessage(cause)}`);
  }

  if (!created.id) {
    throw new IngestionFailure("RAGFlow 未返回数据集 ID");
  }

  const updated = await deps.db
    .update(knowledgeBases)
    .set({ ragflowDatasetId: created.id })
    .where(
      and(
        eq(knowledgeBases.id, knowledgeBase.id),
        eq(knowledgeBases.tenantId, knowledgeBase.tenantId),
        isNull(knowledgeBases.deletedAt),
      ),
    );
  if (affectedRowCount(updated) === 0) {
    await deleteRemoteDataset(deps, created.id, log);
    throw new IngestionSkipped("knowledge_base_deleted");
  }
  log({
    event: "dataset_created",
    knowledgeBaseId: knowledgeBase.id,
    datasetId: created.id,
  });
  return created.id;
}

async function ensureUploaded(
  document: Document,
  datasetId: string,
  deps: IngestionDependencies,
  log: (event: Record<string, unknown>) => void,
): Promise<string> {
  if (!(await isDocumentActive(deps.db, document.tenantId, document.id))) {
    throw new IngestionSkipped("document_deleted");
  }

  if (document.ragflowDocumentId) {
    if (document.status === "pending") {
      try {
        await deps.client.parseDocuments(datasetId, [document.ragflowDocumentId]);
      } catch (cause) {
        throw new IngestionFailure(`重新启动 RAGFlow 解析失败：${toErrorMessage(cause)}`);
      }
    }
    return document.ragflowDocumentId;
  }

  if (!(await isDocumentActive(deps.db, document.tenantId, document.id))) {
    throw new IngestionSkipped("document_deleted");
  }

  let data: Buffer;
  try {
    data = await readFile(document.sourceKey);
  } catch {
    throw new IngestionFailure("源文件不存在或无法读取");
  }

  let uploaded: { id: string };
  try {
    uploaded = await deps.client.uploadDocument(datasetId, {
      fileName: document.title,
      mimeType: document.mimeType ?? "application/octet-stream",
      data,
    });
  } catch (cause) {
    throw new IngestionFailure(`上传 RAGFlow 失败：${toErrorMessage(cause)}`);
  }

  const updated = await deps.db
    .update(documents)
    .set({
      ragflowDocumentId: uploaded.id,
      status: "parsing",
      errorMessage: null,
    })
    .where(
      and(
        eq(documents.id, document.id),
        eq(documents.tenantId, document.tenantId),
        isNull(documents.deletedAt),
        ne(documents.status, "deleted"),
      ),
    );
  if (affectedRowCount(updated) === 0) {
    await deleteRemoteDocument(deps, datasetId, uploaded.id, log);
    throw new IngestionSkipped("document_deleted");
  }

  try {
    await deps.client.parseDocuments(datasetId, [uploaded.id]);
  } catch (cause) {
    throw new IngestionFailure(`启动 RAGFlow 解析失败：${toErrorMessage(cause)}`);
  }

  log({
    event: "document_uploaded",
    documentId: document.id,
    ragflowDocumentId: uploaded.id,
  });
  return uploaded.id;
}

async function pollUntilFinished(
  document: Document,
  datasetId: string,
  ragflowDocumentId: string,
  deps: IngestionDependencies,
  sleep: (ms: number) => Promise<void>,
): Promise<"ready" | "failed"> {
  const startedAt = Date.now();
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= deps.config.maxPollAttempts; attempt += 1) {
    if (!(await isDocumentActive(deps.db, document.tenantId, document.id))) {
      await deleteRemoteDocument(deps, datasetId, ragflowDocumentId, () => {});
      throw new IngestionSkipped("document_deleted");
    }

    let remote: Awaited<ReturnType<IngestionClient["getDocument"]>>;
    try {
      remote = await deps.client.getDocument(datasetId, ragflowDocumentId);
    } catch (cause) {
      remote = null;
      lastError = toErrorMessage(cause);
    }

    if (remote?.state === "ready") {
      const updated = await deps.db
        .update(documents)
        .set({ status: "ready", errorMessage: null })
        .where(
          and(
            eq(documents.id, document.id),
            eq(documents.tenantId, document.tenantId),
            isNull(documents.deletedAt),
            ne(documents.status, "deleted"),
          ),
        );
      if (affectedRowCount(updated) === 0) {
        await deleteRemoteDocument(deps, datasetId, ragflowDocumentId, () => {});
        throw new IngestionSkipped("document_deleted");
      }
      return "ready";
    }

    if (remote?.state === "failed") {
      const message = remote.errorMessage ?? "RAGFlow 解析失败";
      await markFailed(deps.db, document, message);
      return "failed";
    }

    if (remote === null && !lastError) {
      lastError = "RAGFlow 未返回文档状态";
    }

    const timedOut = Date.now() - startedAt >= deps.config.pollTimeoutMs;
    if (timedOut || attempt === deps.config.maxPollAttempts) {
      const reason = timedOut ? "等待 RAGFlow 解析超时" : (lastError ?? "等待 RAGFlow 解析超时");
      await markFailed(deps.db, document, reason);
      return "failed";
    }

    const updated = await deps.db
      .update(documents)
      .set({ status: "parsing", errorMessage: null })
      .where(
        and(
          eq(documents.id, document.id),
          eq(documents.tenantId, document.tenantId),
          isNull(documents.deletedAt),
          ne(documents.status, "ready"),
          ne(documents.status, "deleted"),
        ),
      );
    if (affectedRowCount(updated) === 0) {
      await deleteRemoteDocument(deps, datasetId, ragflowDocumentId, () => {});
      throw new IngestionSkipped("document_deleted");
    }

    await sleep(deps.config.pollIntervalMs);
  }

  await markFailed(deps.db, document, lastError ?? "等待 RAGFlow 解析超时");
  return "failed";
}

async function findDocument(
  db: Database,
  tenantId: string,
  documentId: string,
): Promise<Document | null> {
  const rows = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.tenantId, tenantId),
        isNull(documents.deletedAt),
        ne(documents.status, "deleted"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function findKnowledgeBase(
  db: Database,
  tenantId: string,
  knowledgeBaseId: string,
): Promise<KnowledgeBase | null> {
  const rows = await db
    .select()
    .from(knowledgeBases)
    .where(
      and(
        eq(knowledgeBases.id, knowledgeBaseId),
        eq(knowledgeBases.tenantId, tenantId),
        isNull(knowledgeBases.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function isDocumentActive(
  db: Database,
  tenantId: string,
  documentId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.tenantId, tenantId),
        isNull(documents.deletedAt),
        ne(documents.status, "deleted"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function markFailed(db: Database, document: Document, message: string): Promise<void> {
  await db
    .update(documents)
    .set({
      status: "failed",
      errorMessage: message.slice(0, 500),
    })
    .where(
      and(
        eq(documents.id, document.id),
        eq(documents.tenantId, document.tenantId),
        isNull(documents.deletedAt),
        ne(documents.status, "deleted"),
      ),
    );
}

function affectedRowCount(result: unknown): number {
  if (Array.isArray(result)) {
    const header = result[0];
    if (header && typeof header === "object" && "affectedRows" in header) {
      return Number((header as { affectedRows?: number }).affectedRows ?? 0);
    }
  }
  return 0;
}

async function deleteRemoteDocument(
  deps: IngestionDependencies,
  datasetId: string,
  ragflowDocumentId: string,
  log: (event: Record<string, unknown>) => void,
): Promise<void> {
  try {
    await deps.client.deleteDocument(datasetId, ragflowDocumentId);
    log({ event: "remote_document_cleaned", ragflowDocumentId });
  } catch (cause) {
    log({
      event: "remote_document_cleanup_failed",
      ragflowDocumentId,
      reason: toErrorMessage(cause),
    });
  }
}

async function deleteRemoteDataset(
  deps: IngestionDependencies,
  datasetId: string,
  log: (event: Record<string, unknown>) => void,
): Promise<void> {
  try {
    await deps.client.deleteDataset(datasetId);
    log({ event: "remote_dataset_cleaned", datasetId });
  } catch (cause) {
    log({
      event: "remote_dataset_cleanup_failed",
      datasetId,
      reason: toErrorMessage(cause),
    });
  }
}

function toErrorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim().length > 0) {
    return cause.message.slice(0, 500);
  }
  return "未知错误";
}
