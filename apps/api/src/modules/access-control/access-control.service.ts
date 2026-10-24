import { Inject, Injectable } from "@nestjs/common";
import {
  type AccessPrincipal,
  type AclEntry,
  type DocumentAccessDecision,
  type DocumentRef,
  decideEffectiveDocumentAccess,
  type KnowledgeBaseAclEntry,
  listEffectiveReadableDocumentIds,
} from "@pichat/access-control";
import {
  type Database,
  documentAcls,
  documents,
  knowledgeBaseAcls,
  knowledgeBases,
  users,
} from "@pichat/db";
import type { AccessCheckResponse } from "@pichat/shared";
import { and, eq, isNull, ne } from "drizzle-orm";
import { DATABASE } from "../../common/database.module";

interface AclContext {
  defaults: KnowledgeBaseAclEntry[];
  exceptions: AclEntry[];
}

interface CacheEntry {
  expiresAt: number;
  documentIds: Set<string>;
}

const cacheTtlMs = 60_000;

@Injectable()
export class AccessControlService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listReadableDocumentIds(
    principal: AccessPrincipal,
    knowledgeBaseId: string,
  ): Promise<Set<string>> {
    const knowledgeBase = await this.getKnowledgeBaseVersion(principal.tenantId, knowledgeBaseId);
    if (!knowledgeBase) {
      return new Set();
    }

    if (principal.role === "tenant_admin") {
      const rows = await this.listDocumentRefs(principal.tenantId, knowledgeBaseId);
      return new Set(rows.map((row) => row.id));
    }

    const cacheKey = this.cacheKey(principal, knowledgeBaseId, knowledgeBase.aclVersion);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return new Set(cached.documentIds);
    }

    const documentRefs = await this.listDocumentRefs(principal.tenantId, knowledgeBaseId);
    const context = await this.getAclContext(principal.tenantId, knowledgeBaseId);
    const documentIds = new Set(
      listEffectiveReadableDocumentIds(
        context.defaults,
        context.exceptions,
        principal,
        documentRefs,
      ),
    );

    this.cache.set(cacheKey, {
      expiresAt: Date.now() + cacheTtlMs,
      documentIds,
    });

    return documentIds;
  }

  async canRead(
    documentId: string,
    principal: AccessPrincipal,
  ): Promise<DocumentAccessDecision | null> {
    const document = await this.findDocument(documentId, principal.tenantId);
    if (!document) {
      return null;
    }

    const context = await this.getAclContext(principal.tenantId, document.knowledgeBaseId);
    return decideEffectiveDocumentAccess(context.defaults, context.exceptions, principal, {
      id: document.id,
      knowledgeBaseId: document.knowledgeBaseId,
      aclMode: document.aclMode,
    });
  }

  async accessCheck(
    documentId: string,
    principal: AccessPrincipal,
  ): Promise<AccessCheckResponse | null> {
    const document = await this.findDocument(documentId, principal.tenantId);
    if (!document) {
      return null;
    }

    const context = await this.getAclContext(principal.tenantId, document.knowledgeBaseId);
    const documentRef = {
      id: document.id,
      knowledgeBaseId: document.knowledgeBaseId,
      aclMode: document.aclMode,
    };
    const decision = decideEffectiveDocumentAccess(
      context.defaults,
      context.exceptions,
      principal,
      documentRef,
    );
    const principals = await this.loadActivePrincipals(principal.tenantId);
    const effectiveReaderCount = this.countReaders(context, principals, [documentRef]).get(
      document.id,
    );

    return {
      allowed: decision.allowed,
      reason: decision.reason,
      effectiveReaderCount: effectiveReaderCount ?? 0,
    };
  }

  async effectiveReaderCount(documentId: string, tenantId: string): Promise<number> {
    const document = await this.findDocument(documentId, tenantId);
    if (!document) {
      return 0;
    }

    const context = await this.getAclContext(tenantId, document.knowledgeBaseId);
    const principals = await this.loadActivePrincipals(tenantId);
    return (
      this.countReaders(context, principals, [
        {
          id: document.id,
          knowledgeBaseId: document.knowledgeBaseId,
          aclMode: document.aclMode,
        },
      ]).get(document.id) ?? 0
    );
  }

  async effectiveReaderCountsForKnowledgeBase(
    tenantId: string,
    knowledgeBaseId: string,
  ): Promise<Map<string, number>> {
    const documentRefs = await this.listDocumentRefs(tenantId, knowledgeBaseId);
    if (documentRefs.length === 0) {
      return new Map();
    }

    const context = await this.getAclContext(tenantId, knowledgeBaseId);
    const principals = await this.loadActivePrincipals(tenantId);
    return this.countReaders(context, principals, documentRefs);
  }

  async getAclContext(tenantId: string, knowledgeBaseId: string): Promise<AclContext> {
    const defaultRows = await this.db
      .select({
        tenantId: knowledgeBaseAcls.tenantId,
        knowledgeBaseId: knowledgeBaseAcls.knowledgeBaseId,
        subjectType: knowledgeBaseAcls.subjectType,
        subjectId: knowledgeBaseAcls.subjectId,
        permission: knowledgeBaseAcls.permission,
      })
      .from(knowledgeBaseAcls)
      .where(
        and(
          eq(knowledgeBaseAcls.tenantId, tenantId),
          eq(knowledgeBaseAcls.knowledgeBaseId, knowledgeBaseId),
        ),
      );

    const exceptionRows = await this.db
      .select({
        tenantId: documentAcls.tenantId,
        documentId: documentAcls.documentId,
        knowledgeBaseId: documentAcls.knowledgeBaseId,
        subjectType: documentAcls.subjectType,
        subjectId: documentAcls.subjectId,
        permission: documentAcls.permission,
      })
      .from(documentAcls)
      .where(
        and(eq(documentAcls.tenantId, tenantId), eq(documentAcls.knowledgeBaseId, knowledgeBaseId)),
      );

    return { defaults: defaultRows, exceptions: exceptionRows };
  }

  invalidateKnowledgeBase(tenantId: string, knowledgeBaseId: string): void {
    const prefix = `${tenantId}:${knowledgeBaseId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async getKnowledgeBaseVersion(
    tenantId: string,
    knowledgeBaseId: string,
  ): Promise<{ aclVersion: number } | null> {
    const rows = await this.db
      .select({ aclVersion: knowledgeBases.aclVersion })
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

  private async listDocumentRefs(
    tenantId: string,
    knowledgeBaseId: string,
  ): Promise<DocumentRef[]> {
    return this.db
      .select({
        id: documents.id,
        knowledgeBaseId: documents.knowledgeBaseId,
        aclMode: documents.aclMode,
      })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, tenantId),
          eq(documents.knowledgeBaseId, knowledgeBaseId),
          isNull(documents.deletedAt),
          ne(documents.status, "deleted"),
        ),
      );
  }

  private async findDocument(documentId: string, tenantId: string) {
    const rows = await this.db
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

  private async loadActivePrincipals(tenantId: string): Promise<AccessPrincipal[]> {
    const userRows = await this.db
      .select({ id: users.id, role: users.role, departmentId: users.departmentId })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.status, "active")));

    return userRows.map((user) => ({
      tenantId,
      userId: user.id,
      departmentId: user.departmentId,
      role: user.role,
    }));
  }

  private countReaders(
    context: AclContext,
    principals: AccessPrincipal[],
    documents: DocumentRef[],
  ): Map<string, number> {
    const counts = new Map<string, number>();
    for (const document of documents) {
      let count = 0;
      for (const principal of principals) {
        const decision = decideEffectiveDocumentAccess(
          context.defaults,
          context.exceptions,
          principal,
          document,
        );
        if (decision.allowed) {
          count += 1;
        }
      }
      counts.set(document.id, count);
    }
    return counts;
  }

  private cacheKey(
    principal: AccessPrincipal,
    knowledgeBaseId: string,
    aclVersion: number,
  ): string {
    return [
      principal.tenantId,
      knowledgeBaseId,
      aclVersion,
      principal.userId,
      principal.departmentId ?? "",
    ].join(":");
  }
}
