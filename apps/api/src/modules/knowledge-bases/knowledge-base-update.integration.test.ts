import { randomUUID } from "node:crypto";
import { auditLogs, createDatabase, type Database, knowledgeBases, tenants } from "@pichat/db";
import type { SessionUser } from "@pichat/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessControlService } from "../access-control/access-control.service";
import { KnowledgeBasesService } from "./knowledge-bases.service";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("knowledge base settings update", () => {
  const tenantId = randomUUID();
  const adminId = randomUUID();
  const memberId = randomUUID();
  const knowledgeBaseId = randomUUID();
  const otherKnowledgeBaseId = randomUUID();

  let db: Database;
  let service: KnowledgeBasesService;

  const admin: SessionUser = {
    id: adminId,
    tenantId,
    email: "settings-admin@test.local",
    displayName: "Settings Admin",
    role: "tenant_admin",
    groupIds: [],
  };
  const member: SessionUser = { ...admin, id: memberId, role: "member" };

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL as string);
    service = new KnowledgeBasesService(
      db,
      new AccessControlService(db),
      { createDataset: async () => ({ id: "ds", name: "ds", embeddingModel: "bge-m3" }) } as never,
      { cancelDocuments: async () => {} } as never,
      { get: () => "bge-m3" } as never,
    );

    await db.insert(tenants).values({ id: tenantId, name: "Settings", slug: tenantId });
    await db.insert(knowledgeBases).values([
      {
        id: knowledgeBaseId,
        tenantId,
        name: "Policy",
        description: "old",
        ragflowDatasetId: "ds-policy",
        embeddingModel: "bge-m3",
        aclVersion: 1,
      },
      {
        id: otherKnowledgeBaseId,
        tenantId,
        name: "Taken",
        ragflowDatasetId: "ds-taken",
        embeddingModel: "bge-m3",
        aclVersion: 1,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it("updates name, description and retrieval settings with audit", async () => {
    const updated = await service.update(knowledgeBaseId, admin, {
      name: "Policy 2026",
      description: "new",
      retrievalTopK: 8,
      retrievalSimilarityThreshold: 0.35,
      retrievalVectorWeight: 0.6,
    });

    expect(updated).toMatchObject({
      name: "Policy 2026",
      description: "new",
      retrievalTopK: 8,
      retrievalSimilarityThreshold: 0.35,
      retrievalVectorWeight: 0.6,
    });

    const audit = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.action, "knowledge_base.update"),
          eq(auditLogs.resourceId, knowledgeBaseId),
        ),
      );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.metadata).toMatchObject({ result: "success", name: "Policy 2026" });
  });

  it("rejects duplicate names and non-manager roles", async () => {
    await expect(service.update(knowledgeBaseId, admin, { name: "Taken" })).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(
      service.update(knowledgeBaseId, member, { retrievalTopK: 3 }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
