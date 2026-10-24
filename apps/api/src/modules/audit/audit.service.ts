import { Inject, Injectable } from "@nestjs/common";
import type { Database } from "@pichat/db";
import { auditLogs, documents, knowledgeBases, users } from "@pichat/db";
import {
  type AuditLogListResponse,
  type AuditLogSummary,
  type AuditResult,
  defaultPageSize,
  type SessionUser,
} from "@pichat/shared";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { forbidden } from "../../common/api-error";
import { DATABASE } from "../../common/database.module";
import { buildPaginationMeta, type PaginationInput, pageOffset } from "../../common/pagination";

export interface AuditLogQuery extends Partial<PaginationInput> {
  action?: string;
  resourceType?: string;
  result?: AuditResult;
  actorId?: string;
}

export function canViewAudit(role: string): boolean {
  return role === "tenant_admin" || role === "security_admin";
}

function metadataRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resultFromMetadata(metadata: Record<string, unknown> | null): AuditResult {
  const value = metadata?.result;
  return value === "denied" || value === "failed" ? value : "success";
}

function buildSummary(
  action: string,
  resourceLabel: string | null,
  metadata: Record<string, unknown> | null,
): string {
  const label = resourceLabel ? `「${resourceLabel}」` : "";
  if (action === "knowledge_base.create") {
    return `创建知识库${label}`;
  }
  if (action === "knowledge_base.update") {
    return `更新知识库设置${label}`;
  }
  if (action === "knowledge_base.delete") {
    return `删除知识库${label}`;
  }
  if (action === "knowledge_base.default_access.update") {
    return `更新知识库默认访问范围${label}`;
  }
  if (action === "knowledge_base.acl.update") {
    return `更新知识库权限${label}`;
  }
  if (action === "document.upload") {
    return `上传文档${label}`;
  }
  if (action === "document.delete") {
    return `删除文档${label}`;
  }
  if (action === "document.reparse") {
    return `重新解析文档${label}`;
  }
  if (action === "document.acl.update") {
    return `更新文档权限${label}`;
  }
  if (action === "document.acl.batch_update") {
    const documentIds = metadata?.documentIds;
    const count = Array.isArray(documentIds) ? documentIds.length : null;
    return count === null ? "批量更新文档权限" : `批量更新 ${count} 篇文档权限`;
  }
  if (action === "member.update") {
    return `更新成员${label}`;
  }
  if (action === "member.password_reset") {
    return `重置成员密码${label}`;
  }
  if (action === "model_config.create") {
    return "新增模型配置";
  }
  if (action === "model_config.update") {
    return "更新模型配置";
  }
  if (action === "model_config.delete") {
    return "删除模型配置";
  }
  if (action === "model_config.default") {
    return "切换默认模型";
  }
  return label ? `${action}${label}` : action;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(principal: SessionUser, query: AuditLogQuery): Promise<AuditLogListResponse> {
    if (!canViewAudit(principal.role)) {
      throw forbidden();
    }

    const pagination: PaginationInput = {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? defaultPageSize,
    };
    const conditions = [eq(auditLogs.tenantId, principal.tenantId)];
    if (query.action) {
      conditions.push(eq(auditLogs.action, query.action));
    }
    if (query.resourceType) {
      conditions.push(eq(auditLogs.resourceType, query.resourceType));
    }
    if (query.actorId) {
      conditions.push(eq(auditLogs.actorId, query.actorId));
    }
    if (query.result) {
      conditions.push(
        sql`coalesce(json_unquote(json_extract(${auditLogs.metadata}, '$.result')), 'success') = ${query.result}`,
      );
    }

    const where = and(...conditions);
    const [totalRows, rows] = await Promise.all([
      this.db.select({ total: count() }).from(auditLogs).where(where),
      this.db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(pagination.pageSize)
        .offset(pageOffset(pagination)),
    ]);
    const total = totalRows[0]?.total ?? 0;

    const actorIds = [...new Set(rows.flatMap((row) => (row.actorId ? [row.actorId] : [])))];
    const knowledgeBaseIds = [
      ...new Set(
        rows.flatMap((row) =>
          row.resourceType === "knowledge_base" && row.resourceId ? [row.resourceId] : [],
        ),
      ),
    ];
    const documentIds = [
      ...new Set(
        rows.flatMap((row) =>
          row.resourceType === "document" && row.resourceId ? [row.resourceId] : [],
        ),
      ),
    ];
    const memberIds = [
      ...new Set(
        rows.flatMap((row) =>
          row.resourceType === "member" && row.resourceId ? [row.resourceId] : [],
        ),
      ),
    ];

    const [actorRows, knowledgeBaseRows, documentRows, memberRows] = await Promise.all([
      actorIds.length > 0
        ? this.db
            .select({ id: users.id, displayName: users.displayName })
            .from(users)
            .where(and(eq(users.tenantId, principal.tenantId), inArray(users.id, actorIds)))
        : Promise.resolve([]),
      knowledgeBaseIds.length > 0
        ? this.db
            .select({ id: knowledgeBases.id, name: knowledgeBases.name })
            .from(knowledgeBases)
            .where(
              and(
                eq(knowledgeBases.tenantId, principal.tenantId),
                inArray(knowledgeBases.id, knowledgeBaseIds),
              ),
            )
        : Promise.resolve([]),
      documentIds.length > 0
        ? this.db
            .select({ id: documents.id, title: documents.title })
            .from(documents)
            .where(
              and(eq(documents.tenantId, principal.tenantId), inArray(documents.id, documentIds)),
            )
        : Promise.resolve([]),
      memberIds.length > 0
        ? this.db
            .select({ id: users.id, displayName: users.displayName })
            .from(users)
            .where(and(eq(users.tenantId, principal.tenantId), inArray(users.id, memberIds)))
        : Promise.resolve([]),
    ]);

    const actorNames = new Map(actorRows.map((row) => [row.id, row.displayName] as const));
    const knowledgeBaseNames = new Map(knowledgeBaseRows.map((row) => [row.id, row.name] as const));
    const documentTitles = new Map(documentRows.map((row) => [row.id, row.title] as const));
    const memberNames = new Map(memberRows.map((row) => [row.id, row.displayName] as const));

    const logs: AuditLogSummary[] = rows.map((row) => {
      const metadata = metadataRecord(row.metadata);
      const resourceLabel =
        row.resourceType === "knowledge_base"
          ? row.resourceId
            ? (knowledgeBaseNames.get(row.resourceId) ?? null)
            : null
          : row.resourceType === "document"
            ? row.resourceId
              ? (documentTitles.get(row.resourceId) ?? null)
              : null
            : row.resourceType === "member"
              ? row.resourceId
                ? (memberNames.get(row.resourceId) ?? null)
                : null
              : null;

      return {
        id: row.id,
        actorId: row.actorId,
        actorName: row.actorId ? (actorNames.get(row.actorId) ?? null) : null,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        resourceLabel,
        result: resultFromMetadata(metadata),
        summary: buildSummary(row.action, resourceLabel, metadata),
        metadata,
        createdAt: row.createdAt.toISOString(),
      };
    });

    return { logs, pagination: buildPaginationMeta(pagination, total) };
  }
}
