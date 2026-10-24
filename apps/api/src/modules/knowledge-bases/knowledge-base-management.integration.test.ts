import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConfigService } from "@nestjs/config";
import {
  auditLogs,
  createDatabase,
  type Database,
  departments,
  documentAcls,
  documents,
  knowledgeBaseAcls,
  knowledgeBases,
  tenants,
  users,
} from "@pichat/db";
import type { SessionUser } from "@pichat/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serviceUnavailable } from "../../common/api-error";
import { AccessControlService } from "../access-control/access-control.service";
import type { IngestionQueueService } from "../ingestion/ingestion-queue.service";
import type { ModelConfigsService } from "../model-configs/model-configs.service";
import type { KnowledgeBaseRemoteService } from "./knowledge-base-remote.service";
import { KnowledgeBasesService } from "./knowledge-bases.service";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

class FakeRemote {
  createCalls: Array<{ name: string; embeddingModel: string }> = [];
  deletedDatasets: string[] = [];
  failCreate = false;
  failDelete = false;

  async createDataset(input: { name: string; embeddingModel: string }) {
    if (this.failCreate) {
      throw serviceUnavailable("创建 RAGFlow 数据集失败：RAGFlow unavailable");
    }
    this.createCalls.push({ name: input.name, embeddingModel: input.embeddingModel });
    return {
      id: `rf-${this.createCalls.length}`,
      name: input.name,
      embeddingModel: input.embeddingModel,
    };
  }

  async deleteDataset(datasetId: string): Promise<void> {
    if (this.failDelete) {
      throw new Error("RAGFlow delete failed");
    }
    this.deletedDatasets.push(datasetId);
  }

  async deleteDocument(): Promise<void> {}
}

class FakeQueue {
  cancelled: string[] = [];

  async cancelDocument(documentId: string): Promise<void> {
    this.cancelled.push(documentId);
  }

  async cancelDocuments(documentIds: string[]): Promise<void> {
    this.cancelled.push(...documentIds);
  }
}

describeWithDatabase("knowledge base management", () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const adminId = randomUUID();
  const memberId = randomUUID();
  const foreignAdminId = randomUUID();
  const groupId = randomUUID();
  const outsideGroupId = randomUUID();

  const admin: SessionUser = {
    id: adminId,
    tenantId,
    email: "kb-admin@test.local",
    displayName: "KB Admin",
    role: "tenant_admin",
    departmentId: null,
  };
  const member: SessionUser = {
    id: memberId,
    tenantId,
    email: "kb-member@test.local",
    displayName: "KB Member",
    role: "member",
    departmentId: groupId,
  };
  const foreignAdmin: SessionUser = {
    id: foreignAdminId,
    tenantId: otherTenantId,
    email: "foreign-admin@test.local",
    displayName: "Foreign Admin",
    role: "tenant_admin",
    departmentId: null,
  };

  let db: Database;
  let accessControl: AccessControlService;
  let service: KnowledgeBasesService;
  let remote: FakeRemote;
  let queue: FakeQueue;
  let uploadDirectory: string;

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL as string);
    accessControl = new AccessControlService(db);
    remote = new FakeRemote();
    queue = new FakeQueue();
    uploadDirectory = await mkdtemp(join(tmpdir(), "pichat-kb-"));

    const config = {
      get: (key: string) => {
        if (key === "UPLOAD_DIR") {
          return uploadDirectory;
        }
        if (key === "RAGFLOW_DEFAULT_EMBEDDING_MODEL") {
          return "bge-m3";
        }
        return undefined;
      },
    } as unknown as ConfigService;

    service = new KnowledgeBasesService(
      db,
      accessControl,
      remote as unknown as KnowledgeBaseRemoteService,
      queue as unknown as IngestionQueueService,
      config,
      {
        resolveOptionalForKind: async (_principal: unknown, _kind: string, id?: string) =>
          id
            ? {
                id,
                provider: "siliconflow",
                modelId: "BAAI/bge-m3@SILICONFLOW",
                displayName: "BGE-M3",
                baseUrl: "https://api.siliconflow.cn/v1",
                apiKey: "test",
              }
            : null,
      } as unknown as ModelConfigsService,
    );

    await db.insert(tenants).values([
      { id: tenantId, name: "KB Management", slug: tenantId },
      { id: otherTenantId, name: "KB Management Other", slug: otherTenantId },
    ]);
    await db.insert(departments).values([
      { id: groupId, tenantId, name: "KB Department" },
      { id: outsideGroupId, tenantId, name: "KB Outside Department" },
    ]);
    await db.insert(users).values([
      {
        id: adminId,
        tenantId,
        email: admin.email,
        passwordHash: "scrypt$00$00",
        displayName: admin.displayName,
        role: "tenant_admin",
      },
      {
        id: memberId,
        tenantId,
        email: member.email,
        passwordHash: "scrypt$00$00",
        displayName: member.displayName,
        role: "member",
        departmentId: groupId,
      },
      {
        id: foreignAdminId,
        tenantId: otherTenantId,
        email: foreignAdmin.email,
        passwordHash: "scrypt$00$00",
        displayName: foreignAdmin.displayName,
        role: "tenant_admin",
      },
    ]);
  });

  afterAll(async () => {
    if (!db) {
      return;
    }
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(tenants).where(eq(tenants.id, otherTenantId));
    await db.$client.end();
    await rm(uploadDirectory, { recursive: true, force: true });
  });

  async function createKnowledgeBase(input: {
    name: string;
    datasetId?: string;
    aclVersion?: number;
  }): Promise<string> {
    const id = randomUUID();
    await db.insert(knowledgeBases).values({
      id,
      tenantId,
      name: input.name,
      description: null,
      ragflowDatasetId: input.datasetId ?? `ds-${id}`,
      embeddingModel: "bge-m3",
      aclVersion: input.aclVersion ?? 1,
    });
    return id;
  }

  async function createDocument(
    knowledgeBaseId: string,
    title: string,
    overrides: Partial<typeof documents.$inferInsert> = {},
  ): Promise<string> {
    const id = randomUUID();
    const directory = join(uploadDirectory, tenantId, knowledgeBaseId, id);
    await mkdir(directory, { recursive: true });
    const sourceKey = join(directory, title);
    await writeFile(sourceKey, "hello", "utf8");
    await db.insert(documents).values({
      id,
      tenantId,
      knowledgeBaseId,
      title,
      sourceKey,
      status: "ready",
      ...overrides,
    });
    return id;
  }

  it("creates a knowledge base after creating the RAGFlow dataset", async () => {
    const name = `新建知识库-${randomUUID().slice(0, 8)}`;
    const result = await service.create(admin, {
      name: `  ${name}  `,
      description: "  描述  ",
      embeddingModel: "",
    });

    expect(result.name).toBe(name);
    expect(result.ragflowDatasetId).toMatch(/^rf-/);
    expect(result.embeddingModel).toBe("bge-m3");
    expect(result.aclVersion).toBe(1);
    expect(result.ownerId).toBe(adminId);
    expect(remote.createCalls.at(-1)?.embeddingModel).toBe("bge-m3");

    const row = await db
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.id, result.id))
      .then((rows) => rows[0]);
    expect(row?.deletedAt).toBeNull();

    const audit = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.action, "knowledge_base.create"),
          eq(auditLogs.resourceId, result.id),
        ),
      );
    expect(audit).toHaveLength(1);
  });

  it("uses the selected embedding model configuration when creating a dataset", async () => {
    const result = await service.create(admin, {
      name: `Embedding 配置-${randomUUID().slice(0, 8)}`,
      embeddingConfigId: "embedding-config-1",
    });

    expect(result.embeddingModel).toBe("BAAI/bge-m3@SILICONFLOW");
    expect(remote.createCalls.at(-1)?.embeddingModel).toBe("BAAI/bge-m3@SILICONFLOW");
  });

  it("rejects duplicate names, members, and RAGFlow failures without writing a half-created row", async () => {
    const name = `重复名称-${randomUUID().slice(0, 8)}`;
    await createKnowledgeBase({ name });

    await expect(service.create(admin, { name })).rejects.toMatchObject({ code: "conflict" });
    await expect(service.create(member, { name: `member-${randomUUID()}` })).rejects.toMatchObject({
      code: "forbidden",
    });

    const before = await db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.tenantId, tenantId));
    remote.failCreate = true;
    try {
      await expect(
        service.create(admin, { name: `失败-${randomUUID().slice(0, 8)}` }),
      ).rejects.toMatchObject({ code: "service_unavailable" });
    } finally {
      remote.failCreate = false;
    }
    const after = await db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.tenantId, tenantId));
    expect(after).toHaveLength(before.length);
  });

  it("soft-deletes a knowledge base with its documents, ACLs, files, and queued jobs", async () => {
    const knowledgeBaseId = await createKnowledgeBase({
      name: `待删除-${randomUUID().slice(0, 8)}`,
      datasetId: "ds-delete",
      aclVersion: 3,
    });
    const firstDocument = await createDocument(knowledgeBaseId, "first.txt");
    const secondDocument = await createDocument(knowledgeBaseId, "second.txt");
    await db.insert(knowledgeBaseAcls).values({
      id: randomUUID(),
      tenantId,
      knowledgeBaseId,
      subjectType: "group",
      subjectId: groupId,
      permission: "read",
    });
    await db.insert(documentAcls).values({
      id: randomUUID(),
      tenantId,
      knowledgeBaseId,
      documentId: firstDocument,
      subjectType: "user",
      subjectId: memberId,
      permission: "deny",
    });

    await service.delete(admin, knowledgeBaseId);

    const row = await db
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.id, knowledgeBaseId))
      .then((rows) => rows[0]);
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row?.aclVersion).toBe(4);

    const documentRows = await db
      .select()
      .from(documents)
      .where(eq(documents.knowledgeBaseId, knowledgeBaseId));
    expect(documentRows.every((document) => document.status === "deleted")).toBe(true);
    expect(documentRows.every((document) => document.deletedAt instanceof Date)).toBe(true);

    expect(
      await db.select().from(documentAcls).where(eq(documentAcls.knowledgeBaseId, knowledgeBaseId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(knowledgeBaseAcls)
        .where(eq(knowledgeBaseAcls.knowledgeBaseId, knowledgeBaseId)),
    ).toHaveLength(0);
    expect(existsSync(join(uploadDirectory, tenantId, knowledgeBaseId))).toBe(false);
    expect(queue.cancelled).toEqual(expect.arrayContaining([firstDocument, secondDocument]));
    expect(remote.deletedDatasets).toContain("ds-delete");

    const { knowledgeBases: listed } = await service.list(admin);
    expect(listed.map((item) => item.id)).not.toContain(knowledgeBaseId);
    await expect(service.get(knowledgeBaseId, admin)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(service.listDocuments(knowledgeBaseId, admin)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(
      await accessControl.listReadableDocumentIds(
        { tenantId, userId: memberId, role: "member", departmentId: groupId },
        knowledgeBaseId,
      ),
    ).toEqual(new Set());

    const audit = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.action, "knowledge_base.delete"),
          eq(auditLogs.resourceId, knowledgeBaseId),
        ),
      );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.metadata).toMatchObject({
      remoteCleanup: "success",
      localCleanup: "success",
      aclVersion: 4,
    });

    await service.delete(admin, knowledgeBaseId);
    const auditsAfterRepeat = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.action, "knowledge_base.delete"),
          eq(auditLogs.resourceId, knowledgeBaseId),
        ),
      );
    expect(auditsAfterRepeat).toHaveLength(1);
  });

  it("completes the local deletion and records remote cleanup failures", async () => {
    const knowledgeBaseId = await createKnowledgeBase({
      name: `远端失败-${randomUUID().slice(0, 8)}`,
      datasetId: "ds-remote-fail",
    });
    remote.failDelete = true;
    try {
      await expect(service.delete(admin, knowledgeBaseId)).resolves.toBeUndefined();
    } finally {
      remote.failDelete = false;
    }

    const row = await db
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.id, knowledgeBaseId))
      .then((rows) => rows[0]);
    expect(row?.deletedAt).toBeInstanceOf(Date);

    const audit = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.action, "knowledge_base.delete"),
          eq(auditLogs.resourceId, knowledgeBaseId),
        ),
      );
    expect(audit[0]?.metadata).toMatchObject({
      remoteCleanup: "failed",
      localCleanup: "success",
    });
  });

  it("does not leak deletions across tenants", async () => {
    const knowledgeBaseId = await createKnowledgeBase({
      name: `跨租户-${randomUUID().slice(0, 8)}`,
    });

    await expect(service.delete(foreignAdmin, knowledgeBaseId)).rejects.toMatchObject({
      code: "not_found",
    });

    const row = await db
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.id, knowledgeBaseId))
      .then((rows) => rows[0]);
    expect(row?.deletedAt).toBeNull();
  });

  it("batch replaces document exceptions once and invalidates the ACL cache", async () => {
    const knowledgeBaseId = await createKnowledgeBase({
      name: `批量-${randomUUID().slice(0, 8)}`,
      aclVersion: 5,
    });
    await db.insert(knowledgeBaseAcls).values({
      id: randomUUID(),
      tenantId,
      knowledgeBaseId,
      subjectType: "group",
      subjectId: groupId,
      permission: "read",
    });
    const first = await createDocument(knowledgeBaseId, "batch-1.txt");
    const second = await createDocument(knowledgeBaseId, "batch-2.txt");
    const third = await createDocument(knowledgeBaseId, "batch-3.txt");
    await db.insert(documentAcls).values([
      {
        id: randomUUID(),
        tenantId,
        knowledgeBaseId,
        documentId: first,
        subjectType: "user",
        subjectId: memberId,
        permission: "read",
      },
      {
        id: randomUUID(),
        tenantId,
        knowledgeBaseId,
        documentId: second,
        subjectType: "group",
        subjectId: outsideGroupId,
        permission: "deny",
      },
    ]);

    const principal = {
      tenantId,
      userId: memberId,
      role: "member" as const,
      departmentId: groupId,
    };
    await accessControl.listReadableDocumentIds(principal, knowledgeBaseId);
    const member = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.id, memberId)))
      .limit(1);
    expect(member).toHaveLength(1);

    const result = await service.updateDocumentsAcl(
      admin,
      knowledgeBaseId,
      [first, second, third],
      [{ type: "user", id: memberId, permission: "deny" }],
    );

    expect(result.aclVersion).toBe(6);
    expect(result.documents.map((document) => document.id)).toEqual([first, second, third]);
    expect(
      result.documents.every(
        (document) =>
          document.exceptions.length === 1 &&
          document.exceptions[0]?.permission === "deny" &&
          document.exceptions[0]?.id === memberId,
      ),
    ).toBe(true);

    const versionRow = await db
      .select({ aclVersion: knowledgeBases.aclVersion })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.id, knowledgeBaseId))
      .then((rows) => rows[0]);
    expect(versionRow?.aclVersion).toBe(6);

    const readable = await accessControl.listReadableDocumentIds(principal, knowledgeBaseId);
    expect(readable).toEqual(new Set());

    const exceptionRows = await db
      .select()
      .from(documentAcls)
      .where(eq(documentAcls.knowledgeBaseId, knowledgeBaseId));
    expect(exceptionRows).toHaveLength(3);

    const audit = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.action, "document.acl.batch_update"),
          eq(auditLogs.resourceId, knowledgeBaseId),
        ),
      );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.metadata).toMatchObject({
      documentIds: [first, second, third],
      aclVersion: 6,
    });
  });

  it("rejects batch requests that cross knowledge bases, tenants, or duplicate subjects", async () => {
    const knowledgeBaseId = await createKnowledgeBase({
      name: `批量校验-${randomUUID().slice(0, 8)}`,
    });
    const otherKnowledgeBaseId = await createKnowledgeBase({
      name: `批量校验-其他-${randomUUID().slice(0, 8)}`,
    });
    const documentId = await createDocument(knowledgeBaseId, "valid.txt");
    const otherDocumentId = await createDocument(otherKnowledgeBaseId, "other.txt");

    await expect(
      service.updateDocumentsAcl(admin, knowledgeBaseId, [documentId, otherDocumentId], []),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      service.updateDocumentsAcl(
        admin,
        knowledgeBaseId,
        [documentId],
        [{ type: "user", id: foreignAdminId, permission: "deny" }],
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      service.updateDocumentsAcl(
        admin,
        knowledgeBaseId,
        [documentId],
        [
          { type: "user", id: memberId, permission: "read" },
          { type: "user", id: memberId, permission: "deny" },
        ],
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      service.updateDocumentsAcl(member, knowledgeBaseId, [documentId], []),
    ).rejects.toMatchObject({ code: "forbidden" });

    const foreignKnowledgeBaseId = randomUUID();
    await db.insert(knowledgeBases).values({
      id: foreignKnowledgeBaseId,
      tenantId: otherTenantId,
      name: `批量校验-跨租户-${randomUUID().slice(0, 8)}`,
      description: null,
      ragflowDatasetId: "ds-foreign-batch",
      embeddingModel: "bge-m3",
      aclVersion: 1,
    });
    const foreignDocumentId = randomUUID();
    await db.insert(documents).values({
      id: foreignDocumentId,
      tenantId: otherTenantId,
      knowledgeBaseId: foreignKnowledgeBaseId,
      title: "foreign-batch.txt",
      sourceKey: join(uploadDirectory, "foreign-batch.txt"),
      status: "ready",
    });
    await expect(
      service.updateDocumentsAcl(admin, knowledgeBaseId, [foreignDocumentId], []),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      service.updateDocumentsAcl(admin, foreignKnowledgeBaseId, [foreignDocumentId], []),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("enforces knowledge base access before document mode and document ACL", async () => {
    const knowledgeBaseId = await createKnowledgeBase({
      name: `严格门禁-${randomUUID().slice(0, 8)}`,
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
    const inherited = await createDocument(knowledgeBaseId, "inherit.txt");
    const restricted = await createDocument(knowledgeBaseId, "restricted.txt", {
      aclMode: "restricted",
    });
    await db.insert(documentAcls).values({
      id: randomUUID(),
      tenantId,
      knowledgeBaseId,
      documentId: restricted,
      subjectType: "group",
      subjectId: groupId,
      permission: "read",
    });

    const memberPrincipal = {
      tenantId,
      userId: memberId,
      role: "member" as const,
      departmentId: groupId,
    };
    const outsiderPrincipal = {
      tenantId,
      userId: memberId,
      role: "member" as const,
      departmentId: outsideGroupId,
    };

    expect(
      [...(await accessControl.listReadableDocumentIds(memberPrincipal, knowledgeBaseId))].sort(),
    ).toEqual([inherited, restricted].sort());
    expect(await accessControl.listReadableDocumentIds(outsiderPrincipal, knowledgeBaseId)).toEqual(
      new Set(),
    );

    await db.insert(documentAcls).values({
      id: randomUUID(),
      tenantId,
      knowledgeBaseId,
      documentId: restricted,
      subjectType: "group",
      subjectId: outsideGroupId,
      permission: "read",
    });
    expect(await accessControl.listReadableDocumentIds(outsiderPrincipal, knowledgeBaseId)).toEqual(
      new Set(),
    );
  });

  it("switches a document to restricted mode and records an audit entry", async () => {
    const knowledgeBaseId = await createKnowledgeBase({
      name: `模式切换-${randomUUID().slice(0, 8)}`,
      aclVersion: 2,
    });
    await db.insert(knowledgeBaseAcls).values({
      id: randomUUID(),
      tenantId,
      knowledgeBaseId,
      subjectType: "group",
      subjectId: groupId,
      permission: "read",
    });
    const documentId = await createDocument(knowledgeBaseId, "mode.txt");
    const memberPrincipal = {
      tenantId,
      userId: memberId,
      role: "member" as const,
      departmentId: groupId,
    };

    expect(await accessControl.listReadableDocumentIds(memberPrincipal, knowledgeBaseId)).toEqual(
      new Set([documentId]),
    );

    const result = await service.updateDocumentAclMode(admin, documentId, "restricted");
    expect(result.aclVersion).toBe(3);
    expect(result.document.aclMode).toBe("restricted");
    expect(await accessControl.listReadableDocumentIds(memberPrincipal, knowledgeBaseId)).toEqual(
      new Set(),
    );

    await service.updateDocumentsAcl(
      admin,
      knowledgeBaseId,
      [documentId],
      [{ type: "group", id: groupId, permission: "read" }],
    );
    expect(await accessControl.listReadableDocumentIds(memberPrincipal, knowledgeBaseId)).toEqual(
      new Set([documentId]),
    );

    const audit = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.action, "document.acl_mode.update"),
          eq(auditLogs.resourceId, documentId),
        ),
      );
    expect(audit[0]?.metadata).toMatchObject({
      before: { aclMode: "inherit" },
      after: { aclMode: "restricted" },
      aclVersion: 3,
    });
  });
});
