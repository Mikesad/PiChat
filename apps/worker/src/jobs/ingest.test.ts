import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase, type Database, documents, knowledgeBases, tenants } from "@pichat/db";
import type {
  CreateDatasetInput,
  RAGFlowDataset,
  RAGFlowDocument,
  RAGFlowParseState,
  UploadDocumentInput,
} from "@pichat/ragflow-client";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IngestionClient, IngestionConfig } from "../config.js";
import { runIngestion } from "./ingest.js";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

class FakeRAGFlowClient implements IngestionClient {
  readonly existingDatasets = new Set<string>();
  readonly states = new Map<string, RAGFlowParseState[]>();
  readonly errors = new Map<string, string>();
  uploadCalls = 0;
  parseCalls = 0;
  createCalls = 0;
  private uploadSequence = 0;

  async getDataset(datasetId: string): Promise<RAGFlowDataset | null> {
    return this.existingDatasets.has(datasetId)
      ? { id: datasetId, name: "dataset", embeddingModel: "bge-m3" }
      : null;
  }

  async createDataset(input: CreateDatasetInput): Promise<RAGFlowDataset> {
    this.createCalls += 1;
    const id = `ds-created-${this.createCalls}`;
    this.existingDatasets.add(id);
    return { id, name: input.name, embeddingModel: input.embeddingModel };
  }

  async uploadDocument(_datasetId: string, _input: UploadDocumentInput): Promise<RAGFlowDocument> {
    this.uploadCalls += 1;
    this.uploadSequence += 1;
    const id = `rf-doc-${this.uploadSequence}`;
    this.states.set(id, ["parsing", "ready"]);
    return {
      id,
      name: _input.fileName,
      run: "RUNNING",
      progress: 0,
      state: "parsing",
      errorMessage: null,
    };
  }

  async parseDocuments(): Promise<void> {
    this.parseCalls += 1;
  }

  async getDocument(_datasetId: string, documentId: string): Promise<RAGFlowDocument | null> {
    const states = this.states.get(documentId) ?? ["ready"];
    const state = states.length > 1 ? (states.shift() ?? "ready") : (states[0] ?? "ready");
    return {
      id: documentId,
      name: "document",
      run: state,
      progress: 0,
      state,
      errorMessage: this.errors.get(documentId) ?? null,
    };
  }
}

describeWithDatabase("worker ingestion", () => {
  const tenantId = randomUUID();
  let db: Database;
  let client: FakeRAGFlowClient;
  let uploadDirectory: string;
  let config: IngestionConfig;

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL as string);
    client = new FakeRAGFlowClient();
    uploadDirectory = await mkdtemp(join(tmpdir(), "pichat-ingest-"));
    config = {
      embeddingModel: "bge-m3",
      pollIntervalMs: 1,
      pollTimeoutMs: 60_000,
      maxPollAttempts: 5,
    };

    await db.insert(tenants).values({ id: tenantId, name: "Ingest Test", slug: tenantId });
  });

  afterAll(async () => {
    if (!db) {
      return;
    }
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.$client.end();
    await rm(uploadDirectory, { recursive: true, force: true });
  });

  async function createKnowledgeBase(datasetId: string): Promise<string> {
    const id = randomUUID();
    await db.insert(knowledgeBases).values({
      id,
      tenantId,
      name: `KB ${id}`,
      description: null,
      ragflowDatasetId: datasetId,
      embeddingModel: "bge-m3",
      aclVersion: 1,
    });
    return id;
  }

  async function createDocument(
    knowledgeBaseId: string,
    overrides: Partial<typeof documents.$inferInsert> = {},
  ): Promise<{ id: string; sourceKey: string }> {
    const id = randomUUID();
    const sourceKey = overrides.sourceKey ?? join(uploadDirectory, `${id}.txt`);
    await db.insert(documents).values({
      id,
      tenantId,
      knowledgeBaseId,
      title: `${id}.txt`,
      sourceKey,
      status: "pending",
      sizeBytes: 3,
      mimeType: "text/plain",
      ...overrides,
    });
    return { id, sourceKey };
  }

  function deps(overrides: Partial<IngestionConfig> = {}) {
    return {
      db,
      client,
      config: { ...config, ...overrides },
      sleep: async () => {},
      logger: () => {},
    };
  }

  it("skips documents that are already ready", async () => {
    const knowledgeBaseId = await createKnowledgeBase("ds-existing");
    const document = await createDocument(knowledgeBaseId, { status: "ready" });

    const result = await runIngestion(
      { tenantId, documentId: document.id, knowledgeBaseId },
      deps(),
    );
    expect(result).toMatchObject({ status: "skipped", reason: "already_ready" });
    expect(client.uploadCalls).toBe(0);
  });

  it("polls an existing RAGFlow document without uploading again", async () => {
    client.existingDatasets.add("ds-existing");
    client.states.set("rf-existing", ["ready"]);
    const knowledgeBaseId = await createKnowledgeBase("ds-existing");
    const document = await createDocument(knowledgeBaseId, {
      status: "parsing",
      ragflowDocumentId: "rf-existing",
    });

    const result = await runIngestion(
      { tenantId, documentId: document.id, knowledgeBaseId },
      deps(),
    );
    expect(result.status).toBe("ready");
    expect(client.uploadCalls).toBe(0);

    const row = await db
      .select()
      .from(documents)
      .where(eq(documents.id, document.id))
      .then((rows) => rows[0]);
    expect(row?.status).toBe("ready");
    expect(row?.ragflowDocumentId).toBe("rf-existing");
  });

  it("restarts parsing for a reparsed document that already has a RAGFlow id", async () => {
    client.existingDatasets.add("ds-reparse");
    client.states.set("rf-reparse", ["parsing", "ready"]);
    const knowledgeBaseId = await createKnowledgeBase("ds-reparse");
    const document = await createDocument(knowledgeBaseId, {
      status: "pending",
      ragflowDocumentId: "rf-reparse",
    });

    const parseCallsBefore = client.parseCalls;
    const uploadCallsBefore = client.uploadCalls;
    const result = await runIngestion(
      { tenantId, documentId: document.id, knowledgeBaseId },
      deps(),
    );
    expect(result.status).toBe("ready");
    expect(client.parseCalls).toBe(parseCallsBefore + 1);
    expect(client.uploadCalls).toBe(uploadCallsBefore);
  });

  it("creates a dataset, uploads, parses and becomes ready idempotently", async () => {
    const knowledgeBaseId = await createKnowledgeBase("ds-missing");
    const document = await createDocument(knowledgeBaseId);
    await writeFile(document.sourceKey, "hello", "utf8");

    const createCallsBefore = client.createCalls;
    const uploadCallsBefore = client.uploadCalls;
    const parseCallsBefore = client.parseCalls;
    const result = await runIngestion(
      { tenantId, documentId: document.id, knowledgeBaseId },
      deps(),
    );
    expect(result.status).toBe("ready");
    expect(client.createCalls).toBe(createCallsBefore + 1);
    expect(client.uploadCalls).toBe(uploadCallsBefore + 1);
    expect(client.parseCalls).toBe(parseCallsBefore + 1);

    const documentRow = await db
      .select()
      .from(documents)
      .where(eq(documents.id, document.id))
      .then((rows) => rows[0]);
    expect(documentRow?.status).toBe("ready");
    expect(documentRow?.ragflowDocumentId).toBe(`rf-doc-${uploadCallsBefore + 1}`);
    expect(documentRow?.errorMessage).toBeNull();

    const knowledgeBaseRow = await db
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.id, knowledgeBaseId))
      .then((rows) => rows[0]);
    expect(knowledgeBaseRow?.ragflowDatasetId).toBe(`ds-created-${createCallsBefore + 1}`);

    const duplicate = await runIngestion(
      { tenantId, documentId: document.id, knowledgeBaseId },
      deps(),
    );
    expect(duplicate).toMatchObject({ status: "skipped", reason: "already_ready" });
    expect(client.uploadCalls).toBe(uploadCallsBefore + 1);
  });

  it("records RAGFlow parse failures with a readable error", async () => {
    client.existingDatasets.add("ds-failure");
    client.states.set("rf-failure", ["failed"]);
    client.errors.set("rf-failure", "chunking failed");
    const knowledgeBaseId = await createKnowledgeBase("ds-failure");
    const document = await createDocument(knowledgeBaseId, {
      status: "parsing",
      ragflowDocumentId: "rf-failure",
    });

    const result = await runIngestion(
      { tenantId, documentId: document.id, knowledgeBaseId },
      deps(),
    );
    expect(result.status).toBe("failed");

    const row = await db
      .select()
      .from(documents)
      .where(eq(documents.id, document.id))
      .then((rows) => rows[0]);
    expect(row?.status).toBe("failed");
    expect(row?.errorMessage).toBe("chunking failed");
  });

  it("fails clearly when a new dataset needs a missing embedding model", async () => {
    const knowledgeBaseId = await createKnowledgeBase("ds-needs-embedding");
    const document = await createDocument(knowledgeBaseId);
    await writeFile(document.sourceKey, "hello", "utf8");

    const createCallsBefore = client.createCalls;
    const result = await runIngestion(
      { tenantId, documentId: document.id, knowledgeBaseId },
      deps({ embeddingModel: "" }),
    );
    expect(result.status).toBe("failed");

    const row = await db
      .select()
      .from(documents)
      .where(eq(documents.id, document.id))
      .then((rows) => rows[0]);
    expect(row?.status).toBe("failed");
    expect(row?.errorMessage).toContain("RAGFLOW_DEFAULT_EMBEDDING_MODEL");
    expect(client.createCalls).toBe(createCallsBefore);
  });

  it("fails without uploading when the local source file is missing", async () => {
    client.existingDatasets.add("ds-missing-file");
    const knowledgeBaseId = await createKnowledgeBase("ds-missing-file");
    const document = await createDocument(knowledgeBaseId, {
      sourceKey: join(uploadDirectory, "not-there.txt"),
    });

    const before = client.uploadCalls;
    const result = await runIngestion(
      { tenantId, documentId: document.id, knowledgeBaseId },
      deps(),
    );
    expect(result.status).toBe("failed");
    expect(client.uploadCalls).toBe(before);

    const row = await db
      .select()
      .from(documents)
      .where(eq(documents.id, document.id))
      .then((rows) => rows[0]);
    expect(row?.errorMessage).toContain("源文件");
  });
});
