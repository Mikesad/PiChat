import { Inject, Injectable } from "@nestjs/common";
import type { Database } from "@pichat/db";
import { documents, knowledgeBases } from "@pichat/db";
import type {
  AccessCheckResult,
  AccessScopeKnowledgeBase,
  AccessScopeResponse,
  InternalPrincipal,
} from "@pichat/shared";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { DATABASE } from "../../common/database.module";
import { AccessControlService } from "../access-control/access-control.service";

@Injectable()
export class InternalAccessService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AccessControlService) private readonly accessControl: AccessControlService,
  ) {}

  async scope(
    principal: InternalPrincipal,
    knowledgeBaseIds?: string[],
  ): Promise<AccessScopeResponse> {
    const conditions = [
      eq(knowledgeBases.tenantId, principal.tenantId),
      isNull(knowledgeBases.deletedAt),
    ];
    if (knowledgeBaseIds && knowledgeBaseIds.length > 0) {
      conditions.push(inArray(knowledgeBases.id, knowledgeBaseIds));
    }

    const knowledgeBaseRows = await this.db
      .select({
        id: knowledgeBases.id,
        name: knowledgeBases.name,
        ragflowDatasetId: knowledgeBases.ragflowDatasetId,
      })
      .from(knowledgeBases)
      .where(and(...conditions))
      .orderBy(knowledgeBases.name);

    const result: AccessScopeKnowledgeBase[] = [];
    for (const knowledgeBase of knowledgeBaseRows) {
      const allowedDocumentIds = await this.accessControl.listReadableDocumentIds(
        principal,
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
            eq(documents.tenantId, principal.tenantId),
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
        documents: scopedDocuments,
      });
    }

    return { knowledgeBases: result };
  }

  async check(principal: InternalPrincipal, documentId: string): Promise<AccessCheckResult> {
    const decision = await this.accessControl.canRead(documentId, principal);
    if (!decision) {
      return { allowed: false, reason: "no_grant" };
    }
    return { allowed: decision.allowed, reason: decision.reason };
  }
}
