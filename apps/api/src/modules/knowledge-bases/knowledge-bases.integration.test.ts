import { randomUUID } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import {
  auditLogs,
  createDatabase,
  type Database,
  departments,
  documents,
  knowledgeBaseAcls,
  knowledgeBases,
  tenants,
  users,
} from "@pichat/db";
import type { SessionUser } from "@pichat/shared";
import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessControlService } from "../access-control/access-control.service";
import type { IngestionQueueService } from "../ingestion/ingestion-queue.service";
import type { ModelConfigsService } from "../model-configs/model-configs.service";
import type { KnowledgeBaseRemoteService } from "./knowledge-base-remote.service";
import { KnowledgeBasesService } from "./knowledge-bases.service";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("knowledge base ACL integration", () => {
  const tenantId = randomUUID();
  const adminId = randomUUID();
  const knowledgeAdminId = randomUUID();
  const memberId = randomUUID();
  const outsiderId = randomUUID();
  const groupId = randomUUID();
  const knowledgeBaseId = randomUUID();
  const allowedDocumentId = randomUUID();
  const deniedDocumentId = randomUUID();

  const adminUser: SessionUser = {
    id: adminId,
    tenantId,
    email: "admin@test.local",
    displayName: "Admin",
    role: "tenant_admin",
    departmentId: null,
  };
  const knowledgeAdminUser: SessionUser = {
    id: knowledgeAdminId,
    tenantId,
    email: "knowledge-admin@test.local",
    displayName: "Knowledge Admin",
    role: "knowledge_admin",
    departmentId: null,
  };
  const memberUser: SessionUser = {
    id: memberId,
    tenantId,
    email: "member@test.local",
    displayName: "Member",
    role: "member",
    departmentId: groupId,
  };
  const foreignUser: SessionUser = {
    id: randomUUID(),
    tenantId: randomUUID(),
    email: "foreign@test.local",
    displayName: "Foreign",
    role: "member",
    departmentId: null,
  };

  let db: Database;
  let accessControl: AccessControlService;
  let service: KnowledgeBasesService;

  const remote = {
    createDataset: async () => ({ id: "rf-test", name: "rf-test", embeddingModel: "bge-m3" }),
    deleteDataset: async () => {},
    deleteDocument: async () => {},
  };
  const queue = {
    cancelDocument: async () => {},
    cancelDocuments: async () => {},
  };
  const config = {
    get: (key: string) => (key === "RAGFLOW_DEFAULT_EMBEDDING_MODEL" ? "bge-m3" : undefined),
  } as unknown as ConfigService;

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL as string);
    accessControl = new AccessControlService(db);
    service = new KnowledgeBasesService(
      db,
      accessControl,
      remote as unknown as KnowledgeBaseRemoteService,
      queue as unknown as IngestionQueueService,
      config,
      { resolveOptionalForKind: async () => null } as unknown as ModelConfigsService,
    );

    await db.insert(tenants).values({ id: tenantId, name: "ACL Test", slug: tenantId });
    await db
      .insert(departments)
      .values({ id: groupId, tenantId, name: "ACL Test Group", externalId: null });
    await db.insert(users).values([
      {
        id: adminId,
        tenantId,
        email: adminUser.email,
        passwordHash: "scrypt$00$00",
        displayName: adminUser.displayName,
        role: "tenant_admin",
      },
      {
        id: knowledgeAdminId,
        tenantId,
        email: knowledgeAdminUser.email,
        passwordHash: "scrypt$00$00",
        displayName: knowledgeAdminUser.displayName,
        role: "knowledge_admin",
      },
      {
        id: memberId,
        tenantId,
        email: memberUser.email,
        passwordHash: "scrypt$00$00",
        displayName: memberUser.displayName,
        role: "member",
        departmentId: groupId,
      },
      {
        id: outsiderId,
        tenantId,
        email: "outsider@test.local",
        passwordHash: "scrypt$00$00",
        displayName: "Outsider",
        role: "member",
      },
    ]);
    await db.insert(knowledgeBases).values({
      id: knowledgeBaseId,
      tenantId,
      name: "ACL Test KB",
      description: null,
      ragflowDatasetId: "rf_test",
      embeddingModel: "bge-m3",
      aclVersion: 1,
    });
    await db.insert(knowledgeBaseAcls).values({
      id: randomUUID(),
      tenantId,
      knowledgeBaseId,
      subjectType: "group",
      subjectId: groupId,
      permission: "read",
    });
    await db.insert(documents).values([
      {
        id: allowedDocumentId,
        tenantId,
        knowledgeBaseId,
        title: "Allowed document",
        sourceKey: "D:\\PiChat\\uploads\\allowed.pdf",
        status: "ready",
      },
      {
        id: deniedDocumentId,
        tenantId,
        knowledgeBaseId,
        title: "Denied document",
        sourceKey: "D:\\PiChat\\uploads\\denied.pdf",
        status: "ready",
      },
    ]);
  });

  afterAll(async () => {
    if (!db) {
      return;
    }
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.$client.end();
  });

  it("applies defaults, invalidates the cache and writes an audit entry", async () => {
    const before = await accessControl.listReadableDocumentIds(
      {
        tenantId: memberUser.tenantId,
        userId: memberUser.id,
        role: memberUser.role,
        departmentId: memberUser.departmentId,
      },
      knowledgeBaseId,
    );
    expect([...before].sort()).toEqual([allowedDocumentId, deniedDocumentId].sort());

    const result = await service.updateDocumentAcl(adminUser, deniedDocumentId, [
      { type: "user", id: memberId, permission: "deny" },
    ]);
    expect(result.aclVersion).toBe(2);
    expect(result.document.exceptions).toEqual([
      { type: "user", id: memberId, permission: "deny" },
    ]);

    const after = await accessControl.listReadableDocumentIds(
      {
        tenantId: memberUser.tenantId,
        userId: memberUser.id,
        role: memberUser.role,
        departmentId: memberUser.departmentId,
      },
      knowledgeBaseId,
    );
    expect([...after]).toEqual([allowedDocumentId]);

    const check = await service.accessCheck(deniedDocumentId, memberUser);
    expect(check).toMatchObject({
      allowed: false,
      reason: "explicit_deny",
      effectiveReaderCount: 1,
    });

    const counts = await accessControl.effectiveReaderCountsForKnowledgeBase(
      tenantId,
      knowledgeBaseId,
    );
    expect(counts.get(allowedDocumentId)).toBe(2);
    expect(counts.get(deniedDocumentId)).toBe(1);

    const versionRows = await db
      .select({ aclVersion: knowledgeBases.aclVersion })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.id, knowledgeBaseId));
    expect(versionRows[0]?.aclVersion).toBe(2);

    const auditRows = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.resourceType, "document"),
          eq(auditLogs.resourceId, deniedDocumentId),
        ),
      );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.action).toBe("document.acl.update");
    const metadata = auditRows[0]?.metadata as {
      actorId?: string;
      result?: string;
      aclVersion?: number;
      before?: unknown[];
      after?: unknown[];
    };
    expect(metadata.actorId).toBe(adminId);
    expect(metadata.result).toBe("success");
    expect(metadata.aclVersion).toBe(2);
    expect(metadata.before).toEqual([]);
    expect(metadata.after).toEqual([{ type: "user", id: memberId, permission: "deny" }]);
  });

  it("lets knowledge admins list all document metadata without granting read access", async () => {
    const { documents, pagination } = await service.listDocuments(
      knowledgeBaseId,
      knowledgeAdminUser,
    );
    expect(documents.map((document) => document.id).sort()).toEqual(
      [allowedDocumentId, deniedDocumentId].sort(),
    );
    expect(documents.every((document) => document.canManageAcl)).toBe(true);
    expect(pagination).toMatchObject({ page: 1, pageSize: 10, total: 2, totalPages: 1 });

    await expect(service.accessCheck(deniedDocumentId, knowledgeAdminUser)).resolves.toMatchObject({
      allowed: false,
      reason: "no_grant",
    });
  });

  it("lists locked documents to users without read access when requested", async () => {
    const outsiderUser: SessionUser = {
      id: outsiderId,
      tenantId,
      email: "outsider@test.local",
      displayName: "Outsider",
      role: "member",
      departmentId: null,
    };

    await expect(service.listDocuments(knowledgeBaseId, outsiderUser)).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await service.list(outsiderUser)).knowledgeBases.map((item) => item.id)).not.toContain(
      knowledgeBaseId,
    );

    const { knowledgeBases: summaries, pagination: knowledgeBasePagination } = await service.list(
      outsiderUser,
      true,
    );
    expect(summaries.find((item) => item.id === knowledgeBaseId)?.readableDocumentCount).toBe(0);
    expect(knowledgeBasePagination).toMatchObject({
      page: 1,
      pageSize: 10,
      total: summaries.length,
      totalPages: 1,
    });

    const { documents } = await service.listDocuments(knowledgeBaseId, outsiderUser, true);
    expect(documents.map((document) => document.id).sort()).toEqual(
      [allowedDocumentId, deniedDocumentId].sort(),
    );
    expect(documents.every((document) => document.canRead === false)).toBe(true);
    expect(documents.every((document) => document.exceptions.length === 0)).toBe(true);
  });

  it("does not leak documents across tenants", async () => {
    expect(
      await accessControl.accessCheck(allowedDocumentId, {
        tenantId: foreignUser.tenantId,
        userId: foreignUser.id,
        role: foreignUser.role,
        departmentId: foreignUser.departmentId,
      }),
    ).toBeNull();

    await expect(service.accessCheck(allowedDocumentId, foreignUser)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("lets a knowledge-base deny override document read exceptions", async () => {
    await service.updateDocumentAcl(adminUser, allowedDocumentId, [
      { type: "user", id: memberId, permission: "read" },
    ]);

    const result = await service.updateKnowledgeBaseAcl(
      adminUser,
      knowledgeBaseId,
      [{ type: "group", id: groupId }],
      [{ type: "user", id: memberId }],
    );
    expect(result.knowledgeBase.defaultSubjects).toEqual([{ type: "group", id: groupId }]);
    expect(result.knowledgeBase.deniedSubjects).toEqual([{ type: "user", id: memberId }]);

    const principal = {
      tenantId: memberUser.tenantId,
      userId: memberUser.id,
      role: memberUser.role,
      departmentId: memberUser.departmentId,
    };
    expect([...(await accessControl.listReadableDocumentIds(principal, knowledgeBaseId))]).toEqual(
      [],
    );
    await expect(service.accessCheck(allowedDocumentId, memberUser)).resolves.toMatchObject({
      allowed: false,
      reason: "explicit_deny",
    });
    expect((await service.list(memberUser)).knowledgeBases.map((item) => item.id)).not.toContain(
      knowledgeBaseId,
    );

    const auditRows = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.action, "knowledge_base.acl.update"),
          eq(auditLogs.resourceId, knowledgeBaseId),
        ),
      )
      .orderBy(desc(auditLogs.id))
      .limit(1);
    const metadata = auditRows[0]?.metadata as {
      after?: Array<{ type: string; id: string; permission: string }>;
    };
    expect(metadata.after).toEqual(
      expect.arrayContaining([
        { type: "group", id: groupId, permission: "read" },
        { type: "user", id: memberId, permission: "deny" },
      ]),
    );
  });

  it("rejects a subject that is both allowed and denied at knowledge-base level", async () => {
    await expect(
      service.updateKnowledgeBaseAcl(
        adminUser,
        knowledgeBaseId,
        [{ type: "group", id: groupId }],
        [{ type: "group", id: groupId }],
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("preserves knowledge-base deny rules when the field is omitted", async () => {
    const result = await service.updateKnowledgeBaseAcl(adminUser, knowledgeBaseId, [
      { type: "group", id: groupId },
    ]);
    expect(result.knowledgeBase.deniedSubjects).toEqual([{ type: "user", id: memberId }]);
  });
});
