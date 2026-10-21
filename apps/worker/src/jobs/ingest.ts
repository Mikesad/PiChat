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
    log({ event: "ingestion_failed", documentId, reason: "knowledge_base_not_found" });
    return { documentId, status: "failed", reason: "knowledge_base_not_found" };
  }

  try {
    const datasetId = await ensureDataset(knowledgeBase, deps, log);
    const ragflowDocumentId = await ensureUploaded(document, datasetId, deps, log);

    const finalState = await pollUntilFinished(document, datasetId, ragflowDocumentId, deps, sleep);
    log({ event: "ingestion_finished", documentId, status: finalState });
    return { documentId, status: finalState };
  } catch (cause) {
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

  await deps.db
    .update(knowledgeBases)
    .set({ ragflowDatasetId: created.id })
    .where(
      and(
        eq(knowledgeBases.id, knowledgeBase.id),
        eq(knowledgeBases.tenantId, knowledgeBase.tenantId),
      ),
    );
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

  await deps.db
    .update(documents)
    .set({
      ragflowDocumentId: uploaded.id,
      status: "parsing",
      errorMessage: null,
    })
    .where(and(eq(documents.id, document.id), eq(documents.tenantId, document.tenantId)));

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
    let remote: Awaited<ReturnType<IngestionClient["getDocument"]>>;
    try {
      remote = await deps.client.getDocument(datasetId, ragflowDocumentId);
    } catch (cause) {
      remote = null;
      lastError = toErrorMessage(cause);
    }

    if (remote?.state === "ready") {
      await deps.db
        .update(documents)
        .set({ status: "ready", errorMessage: null })
        .where(and(eq(documents.id, document.id), eq(documents.tenantId, document.tenantId)));
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

    await deps.db
      .update(documents)
      .set({ status: "parsing", errorMessage: null })
      .where(
        and(
          eq(documents.id, document.id),
          eq(documents.tenantId, document.tenantId),
          ne(documents.status, "ready"),
          ne(documents.status, "deleted"),
        ),
      );

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
    .where(and(eq(knowledgeBases.id, knowledgeBaseId), eq(knowledgeBases.tenantId, tenantId)))
    .limit(1);
  return rows[0] ?? null;
}

async function markFailed(db: Database, document: Document, message: string): Promise<void> {
  await db
    .update(documents)
    .set({
      status: "failed",
      errorMessage: message.slice(0, 500),
    })
    .where(and(eq(documents.id, document.id), eq(documents.tenantId, document.tenantId)));
}

function toErrorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim().length > 0) {
    return cause.message.slice(0, 500);
  }
  return "未知错误";
}
