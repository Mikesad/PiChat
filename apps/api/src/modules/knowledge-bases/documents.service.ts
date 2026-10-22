import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { type Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  auditLogs,
  type Database,
  type Document,
  documentAcls,
  documents,
  type KnowledgeBase,
  knowledgeBases,
} from "@pichat/db";
import type { DocumentSummary, SessionUser } from "@pichat/shared";
import { formatSizeLabel } from "@pichat/shared";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { forbidden, invalidRequest, notFound } from "../../common/api-error";
import { DATABASE } from "../../common/database.module";
import { AccessControlService } from "../access-control/access-control.service";
import { IngestionQueueService } from "../ingestion/ingestion-queue.service";
import { KnowledgeBaseRemoteService } from "./knowledge-base-remote.service";
import {
  resolveMaxUploadBytes,
  sanitizeFileName,
  validateUploadFile,
  validateUploadSize,
} from "./upload-file";

export function canManageDocuments(role: string): boolean {
  return role === "tenant_admin" || role === "knowledge_admin";
}

export interface UploadedFileInput {
  fileName: string;
  mimeType: string;
  stream: Readable;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AccessControlService) private readonly accessControl: AccessControlService,
    @Inject(IngestionQueueService) private readonly queue: IngestionQueueService,
    @Inject(KnowledgeBaseRemoteService) private readonly remote: KnowledgeBaseRemoteService,
  ) {}

  maxUploadBytes(): number {
    return resolveMaxUploadBytes(this.config.get<string>("UPLOAD_MAX_BYTES"));
  }

  async upload(
    principal: SessionUser,
    knowledgeBaseId: string,
    input: UploadedFileInput,
  ): Promise<DocumentSummary> {
    if (!canManageDocuments(principal.role)) {
      throw forbidden();
    }

    const knowledgeBase = await this.findKnowledgeBase(knowledgeBaseId, principal.tenantId);
    if (!knowledgeBase) {
      throw notFound();
    }

    const maxBytes = this.maxUploadBytes();
    const validated = validateUploadFile(input.fileName, input.mimeType, 1, maxBytes);
    const documentId = randomUUID();
    const uploadRoot = this.uploadRoot();
    const documentDirectory = resolve(uploadRoot, principal.tenantId, knowledgeBase.id, documentId);
    if (!isInside(uploadRoot, documentDirectory)) {
      throw invalidRequest("上传路径不合法");
    }
    const destination = resolve(documentDirectory, validated.safeFileName);
    if (!isInside(documentDirectory, destination)) {
      throw invalidRequest("文件名不合法");
    }

    await mkdir(documentDirectory, { recursive: true });

    let sizeBytes = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.length;
        callback(null, chunk);
      },
    });

    try {
      await pipeline(input.stream, counter, createWriteStream(destination, { flags: "wx" }));
      if ((input.stream as { truncated?: boolean }).truncated) {
        throw invalidRequest(`文件不能超过 ${Math.floor(maxBytes / (1024 * 1024))}MB`);
      }
      validateUploadSize(sizeBytes, maxBytes);
    } catch (cause) {
      await rm(documentDirectory, { recursive: true, force: true });
      throw cause;
    }

    try {
      await this.db.insert(documents).values({
        id: documentId,
        tenantId: principal.tenantId,
        knowledgeBaseId: knowledgeBase.id,
        title: validated.safeFileName,
        sourceKey: destination,
        status: "pending",
        sizeBytes,
        mimeType: validated.mimeType,
      });
    } catch (cause) {
      await rm(documentDirectory, { recursive: true, force: true });
      throw cause;
    }

    try {
      await this.queue.enqueue({
        tenantId: principal.tenantId,
        documentId,
        knowledgeBaseId: knowledgeBase.id,
      });
    } catch (cause) {
      await this.db
        .update(documents)
        .set({
          status: "failed",
          errorMessage: "任务队列暂时不可用，请稍后重试解析",
        })
        .where(and(eq(documents.id, documentId), eq(documents.tenantId, principal.tenantId)));
      throw cause;
    }

    const row = await this.findDocument(documentId, principal.tenantId);
    if (!row) {
      throw notFound();
    }
    return this.toSummary(row, principal);
  }

  async reparse(principal: SessionUser, documentId: string): Promise<DocumentSummary> {
    if (!canManageDocuments(principal.role)) {
      throw forbidden();
    }

    const document = await this.findDocument(documentId, principal.tenantId);
    if (!document) {
      throw notFound();
    }

    await this.db
      .update(documents)
      .set({ status: "pending", errorMessage: null })
      .where(and(eq(documents.id, document.id), eq(documents.tenantId, principal.tenantId)));

    try {
      await this.queue.enqueue({
        tenantId: principal.tenantId,
        documentId: document.id,
        knowledgeBaseId: document.knowledgeBaseId,
      });
    } catch (cause) {
      await this.db
        .update(documents)
        .set({
          status: "failed",
          errorMessage: "任务队列暂时不可用，请稍后重试解析",
        })
        .where(and(eq(documents.id, document.id), eq(documents.tenantId, principal.tenantId)));
      throw cause;
    }

    const updated = await this.findDocument(document.id, principal.tenantId);
    if (!updated) {
      throw notFound();
    }
    return this.toSummary(updated, principal);
  }

  async remove(principal: SessionUser, documentId: string): Promise<void> {
    if (!canManageDocuments(principal.role)) {
      throw forbidden();
    }

    const existing = await this.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.tenantId, principal.tenantId)))
      .limit(1);
    const document = existing[0];
    if (!document) {
      throw notFound();
    }
    if (document.deletedAt || document.status === "deleted") {
      return;
    }

    const knowledgeBaseRows = await this.db
      .select()
      .from(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.id, document.knowledgeBaseId),
          eq(knowledgeBases.tenantId, principal.tenantId),
        ),
      )
      .limit(1);
    const knowledgeBase = knowledgeBaseRows[0] ?? null;

    const auditId = randomUUID();
    const result = await this.db.transaction(async (tx) => {
      if (knowledgeBase) {
        await tx
          .select({ id: knowledgeBases.id })
          .from(knowledgeBases)
          .where(
            and(
              eq(knowledgeBases.id, knowledgeBase.id),
              eq(knowledgeBases.tenantId, principal.tenantId),
            ),
          )
          .limit(1)
          .for("update");
      }

      const lockedRows = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.id, documentId), eq(documents.tenantId, principal.tenantId)))
        .limit(1)
        .for("update");
      const locked = lockedRows[0];
      if (!locked || locked.deletedAt || locked.status === "deleted") {
        return null;
      }

      const deletedAt = new Date();
      await tx
        .update(documents)
        .set({ deletedAt, status: "deleted", errorMessage: null })
        .where(and(eq(documents.id, locked.id), eq(documents.tenantId, principal.tenantId)));

      await tx
        .delete(documentAcls)
        .where(
          and(
            eq(documentAcls.tenantId, principal.tenantId),
            eq(documentAcls.documentId, locked.id),
          ),
        );

      let aclVersion = knowledgeBase?.aclVersion ?? 0;
      if (knowledgeBase) {
        await tx
          .update(knowledgeBases)
          .set({ aclVersion: sql`${knowledgeBases.aclVersion} + 1` })
          .where(
            and(
              eq(knowledgeBases.id, knowledgeBase.id),
              eq(knowledgeBases.tenantId, principal.tenantId),
            ),
          );
        const versionRows = await tx
          .select({ aclVersion: knowledgeBases.aclVersion })
          .from(knowledgeBases)
          .where(
            and(
              eq(knowledgeBases.id, knowledgeBase.id),
              eq(knowledgeBases.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        aclVersion = versionRows[0]?.aclVersion ?? aclVersion;
      }

      await tx.insert(auditLogs).values({
        id: auditId,
        tenantId: principal.tenantId,
        actorId: principal.id,
        action: "document.delete",
        resourceType: "document",
        resourceId: locked.id,
        metadata: {
          actorId: principal.id,
          result: "success",
          title: locked.title,
          knowledgeBaseId: locked.knowledgeBaseId,
          ragflowDocumentId: locked.ragflowDocumentId,
          aclVersion,
          localCleanup: "pending",
          remoteCleanup: "pending",
        },
      });

      return {
        knowledgeBaseId: locked.knowledgeBaseId,
        ragflowDocumentId: locked.ragflowDocumentId,
        datasetId: knowledgeBase?.ragflowDatasetId ?? null,
      };
    });

    if (!result) {
      return;
    }

    this.accessControl.invalidateKnowledgeBase(principal.tenantId, result.knowledgeBaseId);
    await this.queue.cancelDocument(documentId);

    const local = await this.removeDocumentDirectory(
      principal.tenantId,
      result.knowledgeBaseId,
      documentId,
    );

    let remoteCleanupFailed = false;
    let remoteError: string | null = null;
    if (result.ragflowDocumentId && result.datasetId) {
      try {
        await this.remote.deleteDocument(result.datasetId, result.ragflowDocumentId);
      } catch (cause) {
        remoteCleanupFailed = true;
        remoteError = toErrorMessage(cause);
        this.logger.warn(`RAGFlow document cleanup failed for ${documentId}: ${remoteError}`);
      }
    }

    await this.updateAuditCleanup(auditId, principal.tenantId, {
      localCleanup: local.ok ? "success" : "failed",
      localError: local.error,
      remoteCleanup: remoteCleanupFailed ? "failed" : "success",
      remoteError,
    });
  }

  private uploadRoot(): string {
    const configured = this.config.get<string>("UPLOAD_DIR");
    if (!configured || configured.trim().length === 0) {
      throw new Error("UPLOAD_DIR is not configured");
    }
    return resolve(configured);
  }

  private async removeDocumentDirectory(
    tenantId: string,
    knowledgeBaseId: string,
    documentId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const configured = this.config.get<string>("UPLOAD_DIR")?.trim();
    if (!configured) {
      return { ok: false, error: "UPLOAD_DIR 未配置" };
    }

    const root = resolve(configured);
    const target = resolve(root, tenantId, knowledgeBaseId, documentId);
    if (!isInside(root, target)) {
      return { ok: false, error: "路径不在 UPLOAD_DIR 内" };
    }

    try {
      await rm(target, { recursive: true, force: true });
      return { ok: true };
    } catch (cause) {
      const message = toErrorMessage(cause);
      this.logger.warn(`Local document cleanup failed for ${documentId}: ${message}`);
      return { ok: false, error: message };
    }
  }

  private async updateAuditCleanup(
    auditId: string,
    tenantId: string,
    cleanup: {
      localCleanup: "success" | "failed";
      localError?: string;
      remoteCleanup: "success" | "failed";
      remoteError: string | null;
    },
  ): Promise<void> {
    try {
      await this.db
        .update(auditLogs)
        .set({
          metadata: sql`JSON_SET(
            ${auditLogs.metadata},
            '$.localCleanup', ${cleanup.localCleanup},
            '$.localError', ${cleanup.localError ?? null},
            '$.remoteCleanup', ${cleanup.remoteCleanup},
            '$.remoteError', ${cleanup.remoteError}
          )`,
        })
        .where(and(eq(auditLogs.id, auditId), eq(auditLogs.tenantId, tenantId)));
    } catch (cause) {
      this.logger.warn(`Audit cleanup update failed for ${auditId}: ${toErrorMessage(cause)}`);
    }
  }

  private async findKnowledgeBase(id: string, tenantId: string): Promise<KnowledgeBase | null> {
    const rows = await this.db
      .select()
      .from(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.id, id),
          eq(knowledgeBases.tenantId, tenantId),
          isNull(knowledgeBases.deletedAt),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  private async findDocument(id: string, tenantId: string): Promise<Document | null> {
    const rows = await this.db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, id),
          eq(documents.tenantId, tenantId),
          isNull(documents.deletedAt),
          ne(documents.status, "deleted"),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  private async toSummary(document: Document, principal: SessionUser): Promise<DocumentSummary> {
    const exceptionRows = await this.db
      .select({
        subjectType: documentAcls.subjectType,
        subjectId: documentAcls.subjectId,
        permission: documentAcls.permission,
      })
      .from(documentAcls)
      .where(
        and(
          eq(documentAcls.tenantId, principal.tenantId),
          eq(documentAcls.documentId, document.id),
        ),
      );

    const effectiveReaderCount = await this.accessControl.effectiveReaderCount(
      document.id,
      principal.tenantId,
    );

    return {
      id: document.id,
      knowledgeBaseId: document.knowledgeBaseId,
      title: document.title,
      status: document.status,
      sourceKey: document.sourceKey,
      ragflowDocumentId: document.ragflowDocumentId,
      sizeLabel: formatSizeLabel(document.sizeBytes),
      mimeType: document.mimeType,
      errorMessage: document.errorMessage,
      exceptions: exceptionRows
        .map((row) => ({
          type: row.subjectType,
          id: row.subjectId,
          permission: row.permission,
        }))
        .sort((left, right) =>
          `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`),
        ),
      effectiveReaderCount,
      canManageAcl: canManageDocuments(principal.role),
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };
  }
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error && cause.message.trim().length > 0
    ? cause.message.slice(0, 300)
    : "未知错误";
}

export { sanitizeFileName };
