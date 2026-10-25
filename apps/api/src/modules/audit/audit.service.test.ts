import { randomUUID } from "node:crypto";
import type { Database } from "@pichat/db";
import { auditLogs, createDatabase, documents, knowledgeBases, tenants, users } from "@pichat/db";
import type { SessionUser } from "@pichat/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuditService } from "./audit.service";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("AuditService", () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const adminId = randomUUID();
  const memberId = randomUUID();
  const knowledgeBaseId = randomUUID();
  const documentId = randomUUID();

  let db: Database;
  let service: AuditService;

  const admin: SessionUser = {
    id: adminId,
    tenantId,
    email: "audit-admin@test.local",
    displayName: "Audit Admin",
    role: "tenant_admin",
    departmentId: null,
  };
  const member: SessionUser = {
    ...admin,
    id: memberId,
    role: "member",
    email: "member@test.local",
  };

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL as string);
    service = new AuditService(db);

    await db.insert(tenants).values([
      { id: tenantId, name: "Audit", slug: tenantId },
      { id: otherTenantId, name: "Audit Other", slug: otherTenantId },
    ]);
    await db.insert(users).values({
      id: adminId,
      tenantId,
      email: `audit-admin-${tenantId}@test.local`,
      passwordHash: "scrypt$00$00",
      displayName: "Audit Admin",
      role: "tenant_admin",
    });
    await db.insert(knowledgeBases).values({
      id: knowledgeBaseId,
      tenantId,
      name: "Policy",
      ragflowDatasetId: "ds-policy",
      embeddingModel: "bge-m3",
    });
    await db.insert(documents).values({
      id: documentId,
      tenantId,
      knowledgeBaseId,
      title: "Travel.pdf",
      sourceKey: "travel.pdf",
    });

    await db.insert(auditLogs).values([
      {
        id: randomUUID(),
        tenantId,
        actorId: adminId,
        action: "knowledge_base.update",
        resourceType: "knowledge_base",
        resourceId: knowledgeBaseId,
        metadata: { actorId: adminId, result: "success", name: "Policy" },
      },
      {
        id: randomUUID(),
        tenantId,
        actorId: adminId,
        action: "document.acl.update",
        resourceType: "document",
        resourceId: documentId,
        metadata: { actorId: adminId, result: "failed", after: [] },
      },
      {
        id: randomUUID(),
        tenantId,
        actorId: null,
        action: "document.delete",
        resourceType: "document",
        resourceId: documentId,
        metadata: { result: "success", documentIds: [documentId] },
      },
      {
        id: randomUUID(),
        tenantId: otherTenantId,
        actorId: null,
        action: "knowledge_base.create",
        resourceType: "knowledge_base",
        resourceId: randomUUID(),
        metadata: { result: "success" },
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(tenants).where(eq(tenants.id, otherTenantId));
  });

  it("lists tenant logs with actor and resource labels", async () => {
    const result = await service.list(admin, { page: 1, pageSize: 50 });

    expect(result.logs).toHaveLength(3);
    expect(result.pagination).toMatchObject({
      page: 1,
      pageSize: 50,
      total: 3,
      totalPages: 1,
    });
    const update = result.logs.find((log) => log.action === "knowledge_base.update");
    expect(update).toMatchObject({
      actorName: "Audit Admin",
      resourceLabel: "Policy",
      result: "success",
      summary: "更新知识库设置「Policy」",
    });
    const acl = result.logs.find((log) => log.action === "document.acl.update");
    expect(acl).toMatchObject({
      resourceLabel: "Travel.pdf",
      result: "failed",
    });
  });

  it("reports audit timestamps as the actual event instant", async () => {
    const result = await service.list(admin, { page: 1, pageSize: 50 });

    for (const log of result.logs) {
      expect(Math.abs(Date.now() - Date.parse(log.createdAt))).toBeLessThan(60_000);
    }
  });

  it("paginates audit logs with the default page size", async () => {
    const first = await service.list(admin, {});
    expect(first.pagination).toMatchObject({ page: 1, pageSize: 10, total: 3 });

    const second = await service.list(admin, { page: 2, pageSize: 10 });
    expect(second.logs).toHaveLength(0);
    expect(second.pagination).toMatchObject({ page: 2, total: 3, totalPages: 1 });
  });

  it("filters by action, resource type and result", async () => {
    const byAction = await service.list(admin, { action: "document.delete" });
    expect(byAction.logs).toHaveLength(1);

    const byResource = await service.list(admin, { resourceType: "knowledge_base" });
    expect(byResource.logs).toHaveLength(1);

    const byResult = await service.list(admin, { result: "failed" });
    expect(byResult.logs).toHaveLength(1);
    expect(byResult.logs[0]?.action).toBe("document.acl.update");
  });

  it("forbids non-admin roles", async () => {
    await expect(service.list(member, {})).rejects.toMatchObject({ code: "forbidden" });
  });
});
