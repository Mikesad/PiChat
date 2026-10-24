import { Inject, Injectable } from "@nestjs/common";
import type { AccessPrincipal } from "@pichat/access-control";
import type { Database } from "@pichat/db";
import { departments, documents, knowledgeBases, users } from "@pichat/db";
import type {
  AccessCheckResult,
  AccessScopeKnowledgeBase,
  AccessScopeResponse,
  InternalPrincipal,
  SessionUser,
  UserRole,
} from "@pichat/shared";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { DATABASE } from "../../common/database.module";
import { AccessControlService } from "../access-control/access-control.service";
import { ModelConfigsService } from "../model-configs/model-configs.service";

@Injectable()
export class InternalAccessService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AccessControlService) private readonly accessControl: AccessControlService,
    @Inject(ModelConfigsService) private readonly modelConfigsService: ModelConfigsService,
  ) {}

  async scope(
    principal: InternalPrincipal,
    knowledgeBaseIds?: string[],
  ): Promise<AccessScopeResponse> {
    if (knowledgeBaseIds !== undefined && knowledgeBaseIds.length === 0) {
      return { knowledgeBases: [] };
    }

    const resolved = await this.resolvePrincipal(principal);
    if (!resolved) {
      return { knowledgeBases: [] };
    }

    const conditions = [
      eq(knowledgeBases.tenantId, resolved.tenantId),
      isNull(knowledgeBases.deletedAt),
    ];
    if (knowledgeBaseIds !== undefined) {
      conditions.push(inArray(knowledgeBases.id, knowledgeBaseIds));
    }

    const knowledgeBaseRows = await this.db
      .select({
        id: knowledgeBases.id,
        name: knowledgeBases.name,
        ragflowDatasetId: knowledgeBases.ragflowDatasetId,
        retrievalTopK: knowledgeBases.retrievalTopK,
        retrievalSimilarityThreshold: knowledgeBases.retrievalSimilarityThreshold,
        retrievalVectorWeight: knowledgeBases.retrievalVectorWeight,
      })
      .from(knowledgeBases)
      .where(and(...conditions))
      .orderBy(knowledgeBases.name);

    const modelPrincipal: SessionUser = {
      id: resolved.userId,
      tenantId: resolved.tenantId,
      email: "",
      displayName: "",
      role: resolved.role as UserRole,
      departmentId: resolved.departmentId,
    };
    const rerankModelId = await this.modelConfigsService.findActiveModelId(
      modelPrincipal,
      "rerank",
    );

    const result: AccessScopeKnowledgeBase[] = [];
    for (const knowledgeBase of knowledgeBaseRows) {
      const allowedDocumentIds = await this.accessControl.listReadableDocumentIds(
        resolved,
        knowledgeBase.id,
      );
      if (allowedDocumentIds.size === 0) {
        continue;
      }

      const documentRows = await this.db
        .select({
          id: documents.id,
          title: documents.title,
          ragflowDocumentId: documents.ragflowDocumentId,
        })
        .from(documents)
        .where(
          and(
            eq(documents.tenantId, resolved.tenantId),
            eq(documents.knowledgeBaseId, knowledgeBase.id),
            eq(documents.status, "ready"),
            isNull(documents.deletedAt),
            isNotNull(documents.ragflowDocumentId),
            inArray(documents.id, [...allowedDocumentIds]),
          ),
        )
        .orderBy(documents.title);

      const scopedDocuments = documentRows.flatMap((document) =>
        document.ragflowDocumentId
          ? [
              {
                id: document.id,
                title: document.title,
                ragflowDocumentId: document.ragflowDocumentId,
              },
            ]
          : [],
      );

      if (scopedDocuments.length === 0) {
        continue;
      }

      result.push({
        id: knowledgeBase.id,
        name: knowledgeBase.name,
        ragflowDatasetId: knowledgeBase.ragflowDatasetId,
        retrieval: {
          topK: knowledgeBase.retrievalTopK,
          similarityThreshold: knowledgeBase.retrievalSimilarityThreshold,
          vectorWeight: knowledgeBase.retrievalVectorWeight,
          ...(rerankModelId ? { rerankModelId } : {}),
        },
        documents: scopedDocuments,
      });
    }

    return { knowledgeBases: result };
  }

  async check(principal: InternalPrincipal, documentId: string): Promise<AccessCheckResult> {
    const resolved = await this.resolvePrincipal(principal);
    if (!resolved) {
      return { allowed: false, reason: "no_grant" };
    }

    const decision = await this.accessControl.canRead(documentId, resolved);
    if (!decision) {
      return { allowed: false, reason: "no_grant" };
    }
    return { allowed: decision.allowed, reason: decision.reason };
  }

  private async resolvePrincipal(principal: InternalPrincipal): Promise<AccessPrincipal | null> {
    if (!principal.tenantId || !principal.userId) {
      return null;
    }

    const rows = await this.db
      .select({
        id: users.id,
        role: users.role,
        departmentId: users.departmentId,
        departmentTenantId: departments.tenantId,
      })
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .where(
        and(
          eq(users.id, principal.userId),
          eq(users.tenantId, principal.tenantId),
          eq(users.status, "active"),
        ),
      )
      .limit(1);

    const user = rows[0];
    if (!user) {
      return null;
    }

    return {
      tenantId: principal.tenantId,
      userId: user.id,
      role: user.role,
      departmentId:
        user.departmentId && user.departmentTenantId === principal.tenantId
          ? user.departmentId
          : null,
    };
  }
}
