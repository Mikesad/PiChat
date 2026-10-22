import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { ConfigService } from "@nestjs/config";
import {
  auditLogs,
  createDatabase,
  type Database,
  documentAcls,
  documents,
  knowledgeBases,
  tenants,
  users,
} from "@pichat/db";
import type { IngestionJob } from "@pichat/queue";
import type { SessionUser } from "@pichat/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessControlService } from "../access-control/access-control.service";
import type { IngestionQueueService } from "../ingestion/ingestion-queue.service";
import { DocumentsService } from "./documents.service";
import type { KnowledgeBaseRemoteService } from "./knowledge-base-remote.service";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

class FakeQueue {
  jobs: IngestionJob[] = [];
  cancelled: string[] = [];
  fail = false;

  async enqueue(job: IngestionJob): Promise<void> {
    if (this.fail) {
      throw new Error("queue unavailable");
    }
    this.jobs.push(job);
  }

  async cancelDocument(documentId: string): Promise<void> {
    this.cancelled.push(documentId);
  }
}

describeWithDatabase("documents upload service", () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const adminId = randomUUID();
  const memberId = randomUUID();
  const knowledgeBaseId = randomUUID();

  const admin: SessionUser = {
    id: adminId,
    tenantId,
    email: "upload-admin@test.local",
    displayName: "Upload Admin",
    role: "tenant_admin",
    groupIds: [],
  };
  const member: SessionUser = {
    id: memberId,
    tenantId,
    email: "upload-member@test.local",
    displayName: "Upload Member",
    role: "member",
    groupIds: [],
  };

  let db: Database;
  let service: DocumentsService;
  let queue: FakeQueue;
  let uploadDirectory: string;
  const remote = {
    deleted: [] as Array<{ datasetId: string; documentId: string }>,
    failDelete: false,
    createDataset: async () => ({ id: "rf-test", name: "rf-test", embeddingModel: "bge-m3" }),
    deleteDataset: async () => {},
    deleteDocument: async (datasetId: string, documentId: string) => {
      if (remote.failDelete) {
        throw new Error("RAGFlow unavailable");
      }
      remote.deleted.push({ datasetId, documentId });
    },
  };

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL as string);
    queue = new FakeQueue();
    uploadDirectory = await mkdtemp(join(tmpdir(), "pichat-upload-"));
    const config = {
      get: (key: string) => {
        if (key === "UPLOAD_DIR") {
          return uploadDirectory;
        }
        if (key === "UPLOAD_MAX_BYTES") {
          return "10";
        }
        return undefined;
      },
    } as unknown as ConfigService;
    const accessControl = new AccessControlService(db);
    service = new DocumentsService(
      db,
      config,
      accessControl,
      queue as unknown as IngestionQueueService,
      remote as unknown as KnowledgeBaseRemoteService,
    );

    await db.insert(tenants).values([
      { id: tenantId, name: "Upload Test", slug: tenantId },
      { id: otherTenantId, name: "Upload Other", slug: otherTenantId },
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
      },
    ]);
    await db.insert(knowledgeBases).values({
      id: knowledgeBaseId,
      tenantId,
      name: "Upload KB",
      description: null,
      ragflowDatasetId: "ds-upload",
      embeddingModel: "bge-m3",
      aclVersion: 1,
    });
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

  it("stores a sanitized file inside the tenant directory and queues ingestion", async () => {
    const response = await service.upload(admin, knowledgeBaseId, {
      fileName: "../../escape.txt",
      mimeType: "text/plain",
      stream: Readable.from(Buffer.from("hello")),
    });

    expect(response.title).toBe("escape.txt");
    expect(response.status).toBe("pending");
    expect(response.sizeLabel).toBe("5 B");
    expect(response.mimeType).toBe("text/plain");
    expect(response.sourceKey).toBe(
      join(uploadDirectory, tenantId, knowledgeBaseId, response.id, "escape.txt"),
    );
    expect(existsSync(response.sourceKey)).toBe(true);
    expect(existsSync(join(uploadDirectory, "escape.txt"))).toBe(false);
    expect(queue.jobs).toContainEqual({
      tenantId,
      documentId: response.id,
      knowledgeBaseId,
    });
  });

  it("rejects uploads from members without touching the queue", async () => {
    const before = queue.jobs.length;
    await expect(
      service.upload(member, knowledgeBaseId, {
        fileName: "policy.pdf",
        mimeType: "application/pdf",
        stream: Readable.from(Buffer.from("%PDF-1.4")),
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(queue.jobs).toHaveLength(before);
  });

  it("rejects unsupported file types and oversized files", async () => {
    await expect(
      service.upload(admin, knowledgeBaseId, {
        fileName: "malware.exe",
        mimeType: "application/octet-stream",
        stream: Readable.from(Buffer.from("x")),
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });

    await expect(
      service.upload(admin, knowledgeBaseId, {
        fileName: "too-large.txt",
        mimeType: "text/plain",
        stream: Readable.from(Buffer.alloc(11, "a")),
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("does not leak documents across tenants", async () => {
    const otherKnowledgeBaseId = randomUUID();
    await db.insert(knowledgeBases).values({
      id: otherKnowledgeBaseId,
      tenantId: otherTenantId,
      name: "Other KB",
      description: null,
      ragflowDatasetId: "ds-other",
      embeddingModel: "bge-m3",
      aclVersion: 1,
    });

    await expect(
      service.upload(admin, otherKnowledgeBaseId, {
        fileName: "policy.pdf",
        mimeType: "application/pdf",
        stream: Readable.from(Buffer.from("%PDF-1.4")),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps the document but marks it failed when the queue is unavailable", async () => {
    queue.fail = true;
    let documentId = "";
    try {
      await expect(
        service.upload(admin, knowledgeBaseId, {
          fileName: "queued.txt",
          mimeType: "text/plain",
          stream: Readable.from(Buffer.from("hello")),
        }),
      ).rejects.toThrow("queue unavailable");
    } finally {
      queue.fail = false;
    }

    const row = await db
      .select()
      .from(documents)
      .where(eq(documents.title, "queued.txt"))
      .then((rows) => rows[0]);
    documentId = row?.id ?? "";
    expect(documentId).not.toBe("");
    expect(row?.status).toBe("failed");
    expect(row?.errorMessage).toContain("任务队列");
  });

  it("soft-deletes a document, clears ACLs, bumps the version, and removes local files", async () => {
    const documentId = randomUUID();
    const directory = join(uploadDirectory, tenantId, knowledgeBaseId, documentId);
    await mkdir(directory, { recursive: true });
    const sourceKey = join(directory, "delete-me.txt");
    await writeFile(sourceKey, "hello");
    await db.insert(documents).values({
      id: documentId,
      tenantId,
      knowledgeBaseId,
      title: "delete-me.txt",
      sourceKey,
      status: "ready",
      ragflowDocumentId: "rf-delete-me",
    });
    await db.insert(documentAcls).values({
      id: randomUUID(),
      tenantId,
      knowledgeBaseId,
      documentId,
      subjectType: "user",
      subjectId: memberId,
      permission: "deny",
    });

    await service.remove(admin, documentId);

    const row = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .then((rows) => rows[0]);
    expect(row?.status).toBe("deleted");
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(
      await db.select().from(documentAcls).where(eq(documentAcls.documentId, documentId)),
    ).toHaveLength(0);
    expect(existsSync(directory)).toBe(false);
    expect(queue.cancelled).toContain(documentId);
    expect(remote.deleted).toContainEqual({
      datasetId: "ds-upload",
      documentId: "rf-delete-me",
    });

    const version = await db
      .select({ aclVersion: knowledgeBases.aclVersion })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.id, knowledgeBaseId))
      .then((rows) => rows[0]);
    expect(version?.aclVersion).toBe(2);

    const audit = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.action, "document.delete"),
          eq(auditLogs.resourceId, documentId),
        ),
      );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.metadata).toMatchObject({
      remoteCleanup: "success",
      localCleanup: "success",
      aclVersion: 2,
    });

    await service.remove(admin, documentId);
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, tenantId),
            eq(auditLogs.action, "document.delete"),
            eq(auditLogs.resourceId, documentId),
          ),
        ),
    ).toHaveLength(1);
  });

  it("records remote cleanup failures without rolling back the soft delete", async () => {
    const documentId = randomUUID();
    const directory = join(uploadDirectory, tenantId, knowledgeBaseId, documentId);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "remote-fail.txt"), "hello");
    await db.insert(documents).values({
      id: documentId,
      tenantId,
      knowledgeBaseId,
      title: "remote-fail.txt",
      sourceKey: join(directory, "remote-fail.txt"),
      status: "ready",
      ragflowDocumentId: "rf-remote-fail",
    });

    remote.failDelete = true;
    try {
      await expect(service.remove(admin, documentId)).resolves.toBeUndefined();
    } finally {
      remote.failDelete = false;
    }

    const row = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .then((rows) => rows[0]);
    expect(row?.status).toBe("deleted");

    const audit = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.action, "document.delete"),
          eq(auditLogs.resourceId, documentId),
        ),
      );
    expect(audit[0]?.metadata).toMatchObject({ remoteCleanup: "failed" });
  });

  it("rejects document deletion from members and across tenants", async () => {
    const documentId = randomUUID();
    await db.insert(documents).values({
      id: documentId,
      tenantId,
      knowledgeBaseId,
      title: "guarded.txt",
      sourceKey: join(uploadDirectory, "guarded.txt"),
      status: "ready",
    });

    await expect(service.remove(member, documentId)).rejects.toMatchObject({
      code: "forbidden",
    });

    const otherKnowledgeBaseId = randomUUID();
    await db.insert(knowledgeBases).values({
      id: otherKnowledgeBaseId,
      tenantId: otherTenantId,
      name: "Other Delete KB",
      description: null,
      ragflowDatasetId: "ds-other-delete",
      embeddingModel: "bge-m3",
      aclVersion: 1,
    });
    const foreignDocumentId = randomUUID();
    await db.insert(documents).values({
      id: foreignDocumentId,
      tenantId: otherTenantId,
      knowledgeBaseId: otherKnowledgeBaseId,
      title: "foreign.txt",
      sourceKey: join(uploadDirectory, "foreign.txt"),
      status: "ready",
    });

    await expect(service.remove(admin, foreignDocumentId)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("resets a failed document and requeues it on reparse", async () => {
    const documentId = randomUUID();
    await db.insert(documents).values({
      id: documentId,
      tenantId,
      knowledgeBaseId,
      title: "retry.txt",
      sourceKey: join(uploadDirectory, "retry.txt"),
      status: "failed",
      errorMessage: "parse failed",
      mimeType: "text/plain",
      sizeBytes: 5,
    });

    const response = await service.reparse(admin, documentId);
    expect(response.status).toBe("pending");
    expect(response.errorMessage).toBeNull();
    expect(queue.jobs).toContainEqual({ tenantId, documentId, knowledgeBaseId });

    await expect(service.reparse(member, documentId)).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
