import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AccessPrincipal } from "@pichat/access-control";
import {
  auditLogs,
  type Database,
  type Document,
  documentAcls,
  documents,
  groups,
  type KnowledgeBase,
  knowledgeBaseAcls,
  knowledgeBases,
  users,
} from "@pichat/db";
import type {
  AclException,
  AclSubject,
  BatchUpdateDocumentAclResponse,
  CreateKnowledgeBaseRequest,
  DocumentSummary,
  KnowledgeBaseSummary,
  SessionUser,
  UpdateDocumentAclResponse,
  UpdateKnowledgeBaseAclResponse,
} from "@pichat/shared";
import { formatSizeLabel } from "@pichat/shared";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  conflict,
  forbidden,
  invalidRequest,
  notFound,
  serviceUnavailable,
} from "../../common/api-error";
import { DATABASE } from "../../common/database.module";
import { AccessControlService } from "../access-control/access-control.service";
import { IngestionQueueService } from "../ingestion/ingestion-queue.service";
import { KnowledgeBaseRemoteService } from "./knowledge-base-remote.service";

export function canManageAcl(role: string): boolean {
  return role === "tenant_admin" || role === "knowledge_admin";
}

function toAccessPrincipal(user: SessionUser): AccessPrincipal {
  return {
    tenantId: user.tenantId,
    userId: user.id,
    role: user.role,
    groupIds: user.groupIds,
  };
}

@Injectable()
export class KnowledgeBasesService {
  private readonly logger = new Logger(KnowledgeBasesService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AccessControlService) private readonly accessControl: AccessControlService,
    @Inject(KnowledgeBaseRemoteService) private readonly remote: KnowledgeBaseRemoteService,
    @Inject(IngestionQueueService) private readonly queue: IngestionQueueService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async create(
    principal: SessionUser,
    input: CreateKnowledgeBaseRequest,
  ): Promise<KnowledgeBaseSummary> {
    if (!canManageAcl(principal.role)) {
      throw forbidden();
    }

    const name = input.name.trim();
    const existing = await this.db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.tenantId, principal.tenantId), eq(knowledgeBases.name, name)))
      .limit(1);
    if (existing.length > 0) {
      throw conflict("知识库名称已存在");
    }

    const embeddingModel =
      input.embeddingModel?.trim() ||
      (this.config.get<string>("RAGFLOW_DEFAULT_EMBEDDING_MODEL")?.trim() ?? "");
    if (!embeddingModel) {
      throw serviceUnavailable(
        "缺少 RAGFLOW_DEFAULT_EMBEDDING_MODEL，请配置默认 embedding 模型或显式指定",
      );
    }

    const knowledgeBaseId = randomUUID();
    const dataset = await this.remote.createDataset({
      name: datasetNameFor(knowledgeBaseId),
      embeddingModel,
      description: input.description?.trim() || undefined,
    });

    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(knowledgeBases).values({
          id: knowledgeBaseId,
          tenantId: principal.tenantId,
          name,
          description: input.description?.trim() || null,
          ragflowDatasetId: dataset.id,
          embeddingModel: dataset.embeddingModel ?? embeddingModel,
          aclVersion: 1,
        });

        await tx.insert(auditLogs).values({
          id: randomUUID(),
          tenantId: principal.tenantId,
          actorId: principal.id,
          action: "knowledge_base.create",
          resourceType: "knowledge_base",
          resourceId: knowledgeBaseId,
          metadata: {
            actorId: principal.id,
            result: "success",
            name,
            ragflowDatasetId: dataset.id,
            embeddingModel: dataset.embeddingModel ?? embeddingModel,
          },
        });
      });
    } catch (cause) {
      await this.cleanupRemoteDataset(dataset.id);
      if (isDuplicateEntry(cause)) {
        throw conflict("知识库名称已存在");
      }
      throw cause;
    }

    const row = await this.findKnowledgeBase(knowledgeBaseId, principal.tenantId);
    const summary = row ? await this.buildKnowledgeBaseSummary(row, principal) : null;
    if (!summary) {
      throw notFound();
    }
    return summary;
  }

  async delete(principal: SessionUser, knowledgeBaseId: string): Promise<void> {
    if (!canManageAcl(principal.role)) {
      throw forbidden();
    }

    const existing = await this.db
      .select()
      .from(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.id, knowledgeBaseId),
          eq(knowledgeBases.tenantId, principal.tenantId),
        ),
      )
      .limit(1);
    const knowledgeBase = existing[0];
    if (!knowledgeBase) {
      throw notFound();
    }
    if (knowledgeBase.deletedAt) {
      return;
    }

    const auditId = randomUUID();
    const result = await this.db.transaction(async (tx) => {
      const lockedRows = await tx
        .select()
        .from(knowledgeBases)
        .where(
          and(
            eq(knowledgeBases.id, knowledgeBaseId),
            eq(knowledgeBases.tenantId, principal.tenantId),
          ),
        )
        .limit(1)
        .for("update");
      const locked = lockedRows[0];
      if (!locked || locked.deletedAt) {
        return null;
      }

      const documentRows = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(
          and(
            eq(documents.tenantId, principal.tenantId),
            eq(documents.knowledgeBaseId, knowledgeBaseId),
            isNull(documents.deletedAt),
            ne(documents.status, "deleted"),
          ),
        );

      const deletedAt = new Date();
      await tx
        .update(documents)
        .set({ deletedAt, status: "deleted", errorMessage: null })
        .where(
          and(
            eq(documents.tenantId, principal.tenantId),
            eq(documents.knowledgeBaseId, knowledgeBaseId),
            isNull(documents.deletedAt),
          ),
        );

      await tx
        .update(knowledgeBases)
        .set({
          deletedAt,
          aclVersion: sql`${knowledgeBases.aclVersion} + 1`,
        })
        .where(
          and(
            eq(knowledgeBases.id, knowledgeBaseId),
            eq(knowledgeBases.tenantId, principal.tenantId),
          ),
        );

      await tx
        .delete(documentAcls)
        .where(
          and(
            eq(documentAcls.tenantId, principal.tenantId),
            eq(documentAcls.knowledgeBaseId, knowledgeBaseId),
          ),
        );
      await tx
        .delete(knowledgeBaseAcls)
        .where(
          and(
            eq(knowledgeBaseAcls.tenantId, principal.tenantId),
            eq(knowledgeBaseAcls.knowledgeBaseId, knowledgeBaseId),
          ),
        );

      const versionRows = await tx
        .select({ aclVersion: knowledgeBases.aclVersion })
        .from(knowledgeBases)
        .where(
          and(
            eq(knowledgeBases.id, knowledgeBaseId),
            eq(knowledgeBases.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      const aclVersion = versionRows[0]?.aclVersion ?? 0;

      await tx.insert(auditLogs).values({
        id: auditId,
        tenantId: principal.tenantId,
        actorId: principal.id,
        action: "knowledge_base.delete",
        resourceType: "knowledge_base",
        resourceId: knowledgeBaseId,
        metadata: {
          actorId: principal.id,
          result: "success",
          name: locked.name,
          ragflowDatasetId: locked.ragflowDatasetId,
          documentIds: documentRows.map((row) => row.id),
          aclVersion,
          localCleanup: "pending",
          remoteCleanup: "pending",
        },
      });

      return {
        aclVersion,
        datasetId: locked.ragflowDatasetId,
        documentIds: documentRows.map((row) => row.id),
      };
    });

    if (!result) {
      return;
    }

    this.accessControl.invalidateKnowledgeBase(principal.tenantId, knowledgeBaseId);

    await this.queue.cancelDocuments(result.documentIds);

    const local = await this.removeLocalPath(principal.tenantId, knowledgeBaseId);

    let remoteCleanupFailed = false;
    let remoteError: string | null = null;
    try {
      await this.remote.deleteDataset(result.datasetId);
    } catch (cause) {
      remoteCleanupFailed = true;
      remoteError = toErrorMessage(cause);
      this.logger.warn(
        `RAGFlow dataset cleanup failed for knowledge base ${knowledgeBaseId}: ${remoteError}`,
      );
    }

    await this.updateAuditCleanup(auditId, principal.tenantId, {
      localCleanup: local.ok ? "success" : "failed",
      localError: local.error,
      remoteCleanup: remoteCleanupFailed ? "failed" : "success",
      remoteError,
    });
  }

  async list(principal: SessionUser): Promise<KnowledgeBaseSummary[]> {
    const rows = await this.db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.tenantId, principal.tenantId), isNull(knowledgeBases.deletedAt)))
      .orderBy(desc(knowledgeBases.updatedAt));

    const summaries: KnowledgeBaseSummary[] = [];
    for (const row of rows) {
      const summary = await this.buildKnowledgeBaseSummary(row, principal);
      if (summary) {
        summaries.push(summary);
      }
    }
    return summaries;
  }

  async get(id: string, principal: SessionUser): Promise<KnowledgeBaseSummary> {
    const row = await this.findKnowledgeBase(id, principal.tenantId);
    if (!row) {
      throw notFound();
    }

    const summary = await this.buildKnowledgeBaseSummary(row, principal);
    if (!summary) {
      throw notFound();
    }
    return summary;
  }

  async listDocuments(id: string, principal: SessionUser): Promise<DocumentSummary[]> {
    const knowledgeBase = await this.findKnowledgeBase(id, principal.tenantId);
    if (!knowledgeBase) {
      throw notFound();
    }

    const seesAllDocuments =
      principal.role === "tenant_admin" ||
      principal.role === "knowledge_admin" ||
      principal.role === "security_admin";
    const readableIds = seesAllDocuments
      ? null
      : await this.accessControl.listReadableDocumentIds(
          toAccessPrincipal(principal),
          knowledgeBase.id,
        );
    if (!seesAllDocuments && (readableIds?.size ?? 0) === 0) {
      throw notFound();
    }

    const documentRows = await this.db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, principal.tenantId),
          eq(documents.knowledgeBaseId, knowledgeBase.id),
          isNull(documents.deletedAt),
          ne(documents.status, "deleted"),
        ),
      )
      .orderBy(desc(documents.updatedAt));

    const visibleDocuments = readableIds
      ? documentRows.filter((document) => readableIds.has(document.id))
      : documentRows;

    const exceptionRows = await this.listExceptionRows(principal.tenantId, knowledgeBase.id);
    const readerCounts = await this.accessControl.effectiveReaderCountsForKnowledgeBase(
      principal.tenantId,
      knowledgeBase.id,
    );

    return visibleDocuments.map((document) =>
      this.toDocumentSummary(
        document,
        principal,
        exceptionRows.filter((row) => row.documentId === document.id),
        readerCounts.get(document.id) ?? 0,
      ),
    );
  }

  async updateDocumentAcl(
    principal: SessionUser,
    documentId: string,
    exceptions: AclException[],
  ): Promise<UpdateDocumentAclResponse> {
    if (!canManageAcl(principal.role)) {
      throw forbidden();
    }

    const document = await this.findDocument(documentId, principal.tenantId);
    if (!document) {
      throw notFound();
    }

    const seen = new Set<string>();
    for (const exception of exceptions) {
      const key = `${exception.type}:${exception.id}`;
      if (seen.has(key)) {
        throw invalidRequest("主体重复", { subject: key });
      }
      seen.add(key);
    }
    await this.assertSubjectsInTenant(principal.tenantId, exceptions);

    const before = await this.listExceptionRows(principal.tenantId, document.knowledgeBaseId, [
      document.id,
    ]);

    const aclVersion = await this.db.transaction(async (tx) => {
      const lockedKnowledgeBase = await tx
        .select({ id: knowledgeBases.id })
        .from(knowledgeBases)
        .where(
          and(
            eq(knowledgeBases.id, document.knowledgeBaseId),
            eq(knowledgeBases.tenantId, principal.tenantId),
            isNull(knowledgeBases.deletedAt),
          ),
        )
        .limit(1)
        .for("update");
      if (!lockedKnowledgeBase[0]) {
        throw notFound();
      }

      const lockedDocument = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(
          and(
            eq(documents.id, document.id),
            eq(documents.tenantId, principal.tenantId),
            isNull(documents.deletedAt),
            ne(documents.status, "deleted"),
          ),
        )
        .limit(1)
        .for("update");
      if (!lockedDocument[0]) {
        throw notFound();
      }

      await tx
        .delete(documentAcls)
        .where(
          and(
            eq(documentAcls.tenantId, principal.tenantId),
            eq(documentAcls.documentId, document.id),
          ),
        );

      if (exceptions.length > 0) {
        await tx.insert(documentAcls).values(
          exceptions.map((exception) => ({
            id: randomUUID(),
            tenantId: principal.tenantId,
            knowledgeBaseId: document.knowledgeBaseId,
            documentId: document.id,
            subjectType: exception.type,
            subjectId: exception.id,
            permission: exception.permission,
          })),
        );
      }

      await tx
        .update(knowledgeBases)
        .set({ aclVersion: sql`${knowledgeBases.aclVersion} + 1` })
        .where(
          and(
            eq(knowledgeBases.id, document.knowledgeBaseId),
            eq(knowledgeBases.tenantId, principal.tenantId),
          ),
        );

      const versionRows = await tx
        .select({ aclVersion: knowledgeBases.aclVersion })
        .from(knowledgeBases)
        .where(
          and(
            eq(knowledgeBases.id, document.knowledgeBaseId),
            eq(knowledgeBases.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      const nextVersion = versionRows[0]?.aclVersion ?? 0;

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        tenantId: principal.tenantId,
        actorId: principal.id,
        action: "document.acl.update",
        resourceType: "document",
        resourceId: document.id,
        metadata: {
          actorId: principal.id,
          result: "success",
          before: before.map((row) => ({
            type: row.subjectType,
            id: row.subjectId,
            permission: row.permission,
          })),
          after: exceptions.map((exception) => ({
            type: exception.type,
            id: exception.id,
            permission: exception.permission,
          })),
          aclVersion: nextVersion,
        },
      });

      return nextVersion;
    });

    this.accessControl.invalidateKnowledgeBase(principal.tenantId, document.knowledgeBaseId);

    const updatedDocument = await this.findDocument(document.id, principal.tenantId);
    if (!updatedDocument) {
      throw notFound();
    }

    return {
      aclVersion,
      document: await this.buildDocumentSummary(updatedDocument, principal),
    };
  }

  async updateDocumentsAcl(
    principal: SessionUser,
    knowledgeBaseId: string,
    documentIds: string[],
    exceptions: AclException[],
  ): Promise<BatchUpdateDocumentAclResponse> {
    if (!canManageAcl(principal.role)) {
      throw forbidden();
    }

    const knowledgeBase = await this.findKnowledgeBase(knowledgeBaseId, principal.tenantId);
    if (!knowledgeBase) {
      throw notFound();
    }

    const uniqueDocumentIds = [...new Set(documentIds)];
    if (uniqueDocumentIds.length !== documentIds.length) {
      throw invalidRequest("文档 ID 重复");
    }

    const seen = new Set<string>();
    for (const exception of exceptions) {
      const key = `${exception.type}:${exception.id}`;
      if (seen.has(key)) {
        throw invalidRequest("主体重复", { subject: key });
      }
      seen.add(key);
    }
    await this.assertSubjectsInTenant(principal.tenantId, exceptions);

    const documentRows = await this.db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, principal.tenantId),
          eq(documents.knowledgeBaseId, knowledgeBase.id),
          inArray(documents.id, uniqueDocumentIds),
          isNull(documents.deletedAt),
          ne(documents.status, "deleted"),
        ),
      );
    if (documentRows.length !== uniqueDocumentIds.length) {
      throw invalidRequest("文档不属于当前知识库或已删除");
    }

    const beforeRows = await this.listExceptionRows(
      principal.tenantId,
      knowledgeBase.id,
      uniqueDocumentIds,
    );

    const result = await this.db.transaction(async (tx) => {
      const lockedKnowledgeBase = await tx
        .select({ id: knowledgeBases.id })
        .from(knowledgeBases)
        .where(
          and(
            eq(knowledgeBases.id, knowledgeBase.id),
            eq(knowledgeBases.tenantId, principal.tenantId),
            isNull(knowledgeBases.deletedAt),
          ),
        )
        .limit(1)
        .for("update");
      if (!lockedKnowledgeBase[0]) {
        throw notFound();
      }

      const lockedDocuments = await tx
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.tenantId, principal.tenantId),
            eq(documents.knowledgeBaseId, knowledgeBase.id),
            inArray(documents.id, uniqueDocumentIds),
            isNull(documents.deletedAt),
            ne(documents.status, "deleted"),
          ),
        )
        .for("update");
      if (lockedDocuments.length !== uniqueDocumentIds.length) {
        throw invalidRequest("文档不属于当前知识库或已删除");
      }

      await tx
        .delete(documentAcls)
        .where(
          and(
            eq(documentAcls.tenantId, principal.tenantId),
            inArray(documentAcls.documentId, uniqueDocumentIds),
          ),
        );

      if (exceptions.length > 0) {
        await tx.insert(documentAcls).values(
          uniqueDocumentIds.flatMap((documentId) =>
            exceptions.map((exception) => ({
              id: randomUUID(),
              tenantId: principal.tenantId,
              knowledgeBaseId: knowledgeBase.id,
              documentId,
              subjectType: exception.type,
              subjectId: exception.id,
              permission: exception.permission,
            })),
          ),
        );
      }

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
      const nextVersion = versionRows[0]?.aclVersion ?? 0;

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        tenantId: principal.tenantId,
        actorId: principal.id,
        action: "document.acl.batch_update",
        resourceType: "knowledge_base",
        resourceId: knowledgeBase.id,
        metadata: {
          actorId: principal.id,
          result: "success",
          documentIds: uniqueDocumentIds,
          before: {
            documentsWithExceptions: new Set(beforeRows.map((row) => row.documentId)).size,
            totalExceptions: beforeRows.length,
          },
          after: { exceptionsPerDocument: exceptions.length },
          aclVersion: nextVersion,
        },
      });

      return { aclVersion: nextVersion, documents: lockedDocuments };
    });

    this.accessControl.invalidateKnowledgeBase(principal.tenantId, knowledgeBase.id);

    const afterRows = await this.listExceptionRows(
      principal.tenantId,
      knowledgeBase.id,
      uniqueDocumentIds,
    );
    const readerCounts = await this.accessControl.effectiveReaderCountsForKnowledgeBase(
      principal.tenantId,
      knowledgeBase.id,
    );
    const rowsById = new Map(result.documents.map((row) => [row.id, row]));

    const updatedDocuments = uniqueDocumentIds.flatMap((documentId) => {
      const row = rowsById.get(documentId);
      return row
        ? [
            this.toDocumentSummary(
              row,
              principal,
              afterRows.filter((exception) => exception.documentId === documentId),
              readerCounts.get(documentId) ?? 0,
            ),
          ]
        : [];
    });

    return { aclVersion: result.aclVersion, documents: updatedDocuments };
  }

  async updateKnowledgeBaseAcl(
    principal: SessionUser,
    knowledgeBaseId: string,
    defaultSubjects: AclSubject[],
  ): Promise<UpdateKnowledgeBaseAclResponse> {
    if (!canManageAcl(principal.role)) {
      throw forbidden();
    }

    const knowledgeBase = await this.findKnowledgeBase(knowledgeBaseId, principal.tenantId);
    if (!knowledgeBase) {
      throw notFound();
    }

    const seen = new Set<string>();
    const subjects: AclSubject[] = [];
    for (const subject of defaultSubjects) {
      const key = `${subject.type}:${subject.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        subjects.push(subject);
      }
    }
    await this.assertSubjectsInTenant(principal.tenantId, subjects);

    const beforeRows = await this.db
      .select({
        subjectType: knowledgeBaseAcls.subjectType,
        subjectId: knowledgeBaseAcls.subjectId,
        permission: knowledgeBaseAcls.permission,
      })
      .from(knowledgeBaseAcls)
      .where(
        and(
          eq(knowledgeBaseAcls.tenantId, principal.tenantId),
          eq(knowledgeBaseAcls.knowledgeBaseId, knowledgeBase.id),
        ),
      );

    const aclVersion = await this.db.transaction(async (tx) => {
      const lockedKnowledgeBase = await tx
        .select({ id: knowledgeBases.id })
        .from(knowledgeBases)
        .where(
          and(
            eq(knowledgeBases.id, knowledgeBase.id),
            eq(knowledgeBases.tenantId, principal.tenantId),
            isNull(knowledgeBases.deletedAt),
          ),
        )
        .limit(1)
        .for("update");
      if (!lockedKnowledgeBase[0]) {
        throw notFound();
      }

      await tx
        .delete(knowledgeBaseAcls)
        .where(
          and(
            eq(knowledgeBaseAcls.tenantId, principal.tenantId),
            eq(knowledgeBaseAcls.knowledgeBaseId, knowledgeBase.id),
          ),
        );

      if (subjects.length > 0) {
        await tx.insert(knowledgeBaseAcls).values(
          subjects.map((subject) => ({
            id: randomUUID(),
            tenantId: principal.tenantId,
            knowledgeBaseId: knowledgeBase.id,
            subjectType: subject.type,
            subjectId: subject.id,
            permission: "read" as const,
          })),
        );
      }

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
      const nextVersion = versionRows[0]?.aclVersion ?? 0;

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        tenantId: principal.tenantId,
        actorId: principal.id,
        action: "knowledge_base.acl.update",
        resourceType: "knowledge_base",
        resourceId: knowledgeBase.id,
        metadata: {
          actorId: principal.id,
          result: "success",
          before: beforeRows.map((row) => ({
            type: row.subjectType,
            id: row.subjectId,
            permission: row.permission,
          })),
          after: subjects.map((subject) => ({
            type: subject.type,
            id: subject.id,
            permission: "read",
          })),
          aclVersion: nextVersion,
        },
      });

      return nextVersion;
    });

    this.accessControl.invalidateKnowledgeBase(principal.tenantId, knowledgeBase.id);

    return {
      aclVersion,
      knowledgeBase: await this.get(knowledgeBase.id, principal),
    };
  }

  async accessCheck(documentId: string, principal: SessionUser) {
    const result = await this.accessControl.accessCheck(documentId, toAccessPrincipal(principal));
    if (!result) {
      throw notFound();
    }
    return result;
  }

  private async buildKnowledgeBaseSummary(
    knowledgeBase: KnowledgeBase,
    principal: SessionUser,
  ): Promise<KnowledgeBaseSummary | null> {
    const readableIds = await this.accessControl.listReadableDocumentIds(
      toAccessPrincipal(principal),
      knowledgeBase.id,
    );
    if (principal.role === "member" && readableIds.size === 0) {
      return null;
    }

    const documentRows = await this.db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, principal.tenantId),
          eq(documents.knowledgeBaseId, knowledgeBase.id),
          isNull(documents.deletedAt),
          ne(documents.status, "deleted"),
        ),
      );

    const defaultRows = await this.db
      .select({
        subjectType: knowledgeBaseAcls.subjectType,
        subjectId: knowledgeBaseAcls.subjectId,
        permission: knowledgeBaseAcls.permission,
      })
      .from(knowledgeBaseAcls)
      .where(
        and(
          eq(knowledgeBaseAcls.tenantId, principal.tenantId),
          eq(knowledgeBaseAcls.knowledgeBaseId, knowledgeBase.id),
        ),
      );

    const defaultSubjects = defaultRows
      .filter((row) => row.permission === "read")
      .map((row) => ({ type: row.subjectType, id: row.subjectId }));

    return {
      id: knowledgeBase.id,
      name: knowledgeBase.name,
      description: knowledgeBase.description,
      embeddingModel: knowledgeBase.embeddingModel,
      ragflowDatasetId: knowledgeBase.ragflowDatasetId,
      aclVersion: knowledgeBase.aclVersion,
      defaultSubjects,
      documentCount: documentRows.length,
      readableDocumentCount:
        principal.role === "tenant_admin" ? documentRows.length : readableIds.size,
      canManageAcl: canManageAcl(principal.role),
      createdAt: knowledgeBase.createdAt.toISOString(),
      updatedAt: knowledgeBase.updatedAt.toISOString(),
    };
  }

  private async buildDocumentSummary(
    document: Document,
    principal: SessionUser,
  ): Promise<DocumentSummary> {
    const exceptions = await this.listExceptionRows(principal.tenantId, document.knowledgeBaseId, [
      document.id,
    ]);
    const effectiveReaderCount = await this.accessControl.effectiveReaderCount(
      document.id,
      principal.tenantId,
    );

    return this.toDocumentSummary(document, principal, exceptions, effectiveReaderCount);
  }

  private toDocumentSummary(
    document: Document,
    principal: SessionUser,
    exceptionRows: Array<{
      subjectType: "user" | "group";
      subjectId: string;
      permission: "read" | "deny";
    }>,
    effectiveReaderCount: number,
  ): DocumentSummary {
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
      canManageAcl: canManageAcl(principal.role),
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };
  }

  private async listExceptionRows(
    tenantId: string,
    knowledgeBaseId: string,
    documentIds?: string[],
  ): Promise<
    Array<{
      documentId: string;
      subjectType: "user" | "group";
      subjectId: string;
      permission: "read" | "deny";
    }>
  > {
    const conditions = [
      eq(documentAcls.tenantId, tenantId),
      eq(documentAcls.knowledgeBaseId, knowledgeBaseId),
    ];
    if (documentIds) {
      conditions.push(inArray(documentAcls.documentId, documentIds));
    }

    return this.db
      .select({
        documentId: documentAcls.documentId,
        subjectType: documentAcls.subjectType,
        subjectId: documentAcls.subjectId,
        permission: documentAcls.permission,
      })
      .from(documentAcls)
      .where(and(...conditions));
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

  private async removeLocalPath(
    tenantId: string,
    knowledgeBaseId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const configured = this.config.get<string>("UPLOAD_DIR")?.trim();
    if (!configured) {
      return { ok: false, error: "UPLOAD_DIR 未配置" };
    }

    const root = resolve(configured);
    const target = resolve(root, tenantId, knowledgeBaseId);
    if (!isInside(root, target)) {
      return { ok: false, error: "路径不在 UPLOAD_DIR 内" };
    }

    try {
      await rm(target, { recursive: true, force: true });
      return { ok: true };
    } catch (cause) {
      const message = toErrorMessage(cause);
      this.logger.warn(`Local knowledge base cleanup failed for ${knowledgeBaseId}: ${message}`);
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

  private async cleanupRemoteDataset(datasetId: string): Promise<void> {
    try {
      await this.remote.deleteDataset(datasetId);
    } catch (cause) {
      this.logger.warn(
        `Failed to clean up RAGFlow dataset ${datasetId} after a create failure: ${toErrorMessage(
          cause,
        )}`,
      );
    }
  }

  private async assertSubjectsInTenant(
    tenantId: string,
    subjects: Array<{ type: "user" | "group"; id: string }>,
  ): Promise<void> {
    const userIds = [...new Set(subjects.filter((s) => s.type === "user").map((s) => s.id))];
    const groupIds = [...new Set(subjects.filter((s) => s.type === "group").map((s) => s.id))];

    if (userIds.length > 0) {
      const rows = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), inArray(users.id, userIds)));
      if (rows.length !== userIds.length) {
        throw invalidRequest("主体不属于当前租户");
      }
    }

    if (groupIds.length > 0) {
      const rows = await this.db
        .select({ id: groups.id })
        .from(groups)
        .where(and(eq(groups.tenantId, tenantId), inArray(groups.id, groupIds)));
      if (rows.length !== groupIds.length) {
        throw invalidRequest("主体不属于当前租户");
      }
    }
  }
}

function datasetNameFor(knowledgeBaseId: string): string {
  return `pichat-${knowledgeBaseId}`;
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}

function isDuplicateEntry(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code?: unknown }).code === "ER_DUP_ENTRY"
  );
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error && cause.message.trim().length > 0
    ? cause.message.slice(0, 300)
    : "未知错误";
}
