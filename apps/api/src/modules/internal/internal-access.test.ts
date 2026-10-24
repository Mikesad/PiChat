import { randomUUID } from "node:crypto";
import type { Database } from "@pichat/db";
import {
  createDatabase,
  departments,
  documentAcls,
  documents,
  knowledgeBaseAcls,
  knowledgeBases,
  modelConfigs,
  tenants,
  users,
} from "@pichat/db";
import type { InternalPrincipal } from "@pichat/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ModelConfigCrypto } from "../../common/model-config-crypto";
import { AccessControlService } from "../access-control/access-control.service";
import { ModelConfigsService } from "../model-configs/model-configs.service";
import { InternalAccessService } from "./internal-access.service";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("InternalAccessService", () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const adminId = randomUUID();
  const memberId = randomUUID();
  const groupId = randomUUID();
  const knowledgeBaseId = randomUUID();
  const docAllowed = randomUUID();
  const docDenied = randomUUID();
  const docPending = randomUUID();
  const docNoRagflow = randomUUID();

  let db: Database;
  let service: InternalAccessService;

  const admin: InternalPrincipal = {
    tenantId,
    userId: adminId,
  };
  const member: InternalPrincipal = {
    tenantId,
    userId: memberId,
  };

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL as string);
    service = new InternalAccessService(
      db,
      new AccessControlService(db),
      new ModelConfigsService(db, new ModelConfigCrypto(Buffer.alloc(32, 4))),
    );

    await db.insert(tenants).values([
      { id: tenantId, name: "Internal Access", slug: tenantId },
      { id: otherTenantId, name: "Internal Other", slug: otherTenantId },
    ]);
    await db.insert(departments).values({ id: groupId, tenantId, name: "Support" });
    await db.insert(users).values([
      {
        id: adminId,
        tenantId,
        email: `admin-${tenantId}@test.local`,
        passwordHash: "scrypt$00$00",
        displayName: "Admin",
        role: "tenant_admin",
      },
      {
        id: memberId,
        tenantId,
        email: `member-${tenantId}@test.local`,
        passwordHash: "scrypt$00$00",
        displayName: "Member",
        role: "member",
        departmentId: groupId,
      },
    ]);

    await db.insert(knowledgeBases).values({
      id: knowledgeBaseId,
      tenantId,
      name: "Policy",
      ragflowDatasetId: "ds-policy",
      embeddingModel: "bge-m3",
      retrievalTopK: 9,
      retrievalSimilarityThreshold: 0.4,
      retrievalVectorWeight: 0.7,
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
        id: docAllowed,
        tenantId,
        knowledgeBaseId,
        title: "Allowed.pdf",
        sourceKey: "allowed.pdf",
        ragflowDocumentId: "rf-allowed",
        status: "ready",
      },
      {
        id: docDenied,
        tenantId,
        knowledgeBaseId,
        title: "Denied.pdf",
        sourceKey: "denied.pdf",
        ragflowDocumentId: "rf-denied",
        status: "ready",
      },
      {
        id: docPending,
        tenantId,
        knowledgeBaseId,
        title: "Pending.pdf",
        sourceKey: "pending.pdf",
        ragflowDocumentId: "rf-pending",
        status: "parsing",
      },
      {
        id: docNoRagflow,
        tenantId,
        knowledgeBaseId,
        title: "NoRagflow.pdf",
        sourceKey: "no-ragflow.pdf",
        ragflowDocumentId: null,
        status: "ready",
      },
    ]);
    await db.insert(documentAcls).values({
      id: randomUUID(),
      tenantId,
      knowledgeBaseId,
      documentId: docDenied,
      subjectType: "group",
      subjectId: groupId,
      permission: "deny",
    });
  });

  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(tenants).where(eq(tenants.id, otherTenantId));
  });

  it("returns only ready documents with a RAGFlow id for members", async () => {
    const result = await service.scope(member, [knowledgeBaseId]);
    expect(result.knowledgeBases).toHaveLength(1);
    expect(result.knowledgeBases[0]?.retrieval).toEqual({
      topK: 9,
      similarityThreshold: 0.4,
      vectorWeight: 0.7,
    });
    expect(result.knowledgeBases[0]?.documents).toEqual([
      { id: docAllowed, title: "Allowed.pdf", ragflowDocumentId: "rf-allowed" },
    ]);
  });

  it("lets tenant_admin read all ready documents but still excludes pending", async () => {
    const result = await service.scope(admin, [knowledgeBaseId]);
    const ids = result.knowledgeBases[0]?.documents.map((document) => document.id) ?? [];
    expect(ids).toEqual([docAllowed, docDenied]);
  });

  it("returns no scope for an explicitly empty knowledge-base selection", async () => {
    await expect(service.scope(member, [])).resolves.toEqual({ knowledgeBases: [] });
  });

  it("re-checks current document access", async () => {
    await expect(service.check(member, docAllowed)).resolves.toMatchObject({ allowed: true });
    await expect(service.check(member, docDenied)).resolves.toMatchObject({ allowed: false });
    await expect(service.check(member, randomUUID())).resolves.toMatchObject({ allowed: false });
  });

  it("re-resolves the current department instead of trusting the caller", async () => {
    await db.update(users).set({ departmentId: null }).where(eq(users.id, memberId));
    await expect(service.scope(member, [knowledgeBaseId])).resolves.toEqual({ knowledgeBases: [] });
    await expect(service.check(member, docAllowed)).resolves.toMatchObject({ allowed: false });

    await db.update(users).set({ departmentId: groupId }).where(eq(users.id, memberId));
    await expect(service.check(member, docAllowed)).resolves.toMatchObject({ allowed: true });
  });

  it("denies access as soon as the account is disabled", async () => {
    await db.update(users).set({ status: "disabled" }).where(eq(users.id, memberId));
    await expect(service.scope(member, [knowledgeBaseId])).resolves.toEqual({ knowledgeBases: [] });
    await expect(service.check(member, docAllowed)).resolves.toMatchObject({ allowed: false });

    await db.update(users).set({ status: "active" }).where(eq(users.id, memberId));
    await expect(service.check(member, docAllowed)).resolves.toMatchObject({ allowed: true });
  });

  it("denies users from another tenant", async () => {
    const foreign: InternalPrincipal = { tenantId: otherTenantId, userId: memberId };
    await expect(service.scope(foreign, [knowledgeBaseId])).resolves.toEqual({
      knowledgeBases: [],
    });
    await expect(service.check(foreign, docAllowed)).resolves.toMatchObject({ allowed: false });
  });

  it("adds the active rerank model to retrieval settings", async () => {
    await db.insert(modelConfigs).values({
      id: randomUUID(),
      tenantId,
      userId: memberId,
      kind: "rerank",
      provider: "siliconflow",
      modelId: "BAAI/bge-reranker-v2-m3@SILICONFLOW",
      displayName: "BGE Reranker",
      encryptedApiKey: null,
      isDefault: true,
    });

    const result = await service.scope(member, [knowledgeBaseId]);
    expect(result.knowledgeBases[0]?.retrieval).toMatchObject({
      topK: 9,
      similarityThreshold: 0.4,
      vectorWeight: 0.7,
      rerankModelId: "BAAI/bge-reranker-v2-m3@SILICONFLOW",
    });
  });
});
