import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
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
  DocumentSummary,
  KnowledgeBaseSummary,
  SessionUser,
  UpdateDocumentAclResponse,
  UpdateKnowledgeBaseAclResponse,
} from "@pichat/shared";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { forbidden, invalidRequest, notFound } from "../../common/api-error";
import { DATABASE } from "../../common/database.module";
import { AccessControlService } from "../access-control/access-control.service";

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
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AccessControlService) private readonly accessControl: AccessControlService,
  ) {}

  async list(principal: SessionUser): Promise<KnowledgeBaseSummary[]> {
    const rows = await this.db
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.tenantId, principal.tenantId))
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
      sizeLabel: null,
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
      .where(and(eq(knowledgeBases.id, id), eq(knowledgeBases.tenantId, tenantId)))
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
