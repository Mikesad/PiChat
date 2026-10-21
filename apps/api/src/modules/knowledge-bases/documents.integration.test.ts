import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { ConfigService } from "@nestjs/config";
import {
  createDatabase,
  type Database,
  documents,
  knowledgeBases,
  tenants,
  users,
} from "@pichat/db";
import type { IngestionJob } from "@pichat/queue";
import type { SessionUser } from "@pichat/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessControlService } from "../access-control/access-control.service";
import type { IngestionQueueService } from "../ingestion/ingestion-queue.service";
import { DocumentsService } from "./documents.service";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

class FakeQueue {
  jobs: IngestionJob[] = [];
  fail = false;

  async enqueue(job: IngestionJob): Promise<void> {
    if (this.fail) {
      throw new Error("queue unavailable");
    }
    this.jobs.push(job);
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
