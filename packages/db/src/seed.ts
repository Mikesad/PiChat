import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { inArray } from "drizzle-orm";
import { createDatabase } from "./client.js";
import { hashPassword } from "./password.js";
import {
  documentAcls,
  documents,
  groupMembers,
  groups,
  knowledgeBaseAcls,
  knowledgeBases,
  tenants,
  users,
} from "./schema.js";
import {
  seedDocuments,
  seedGroups,
  seedKnowledgeBases,
  seedPassword,
  seedTenant,
  seedUsers,
} from "./seed-data.js";

const envDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(envDir, "../../../.env"), quiet: true });
config({ quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const db = createDatabase(connectionString);

async function seed() {
  const passwordHash = await hashPassword(seedPassword);

  await db.transaction(async (tx) => {
    await tx
      .insert(tenants)
      .values(seedTenant)
      .onDuplicateKeyUpdate({ set: { name: seedTenant.name, slug: seedTenant.slug } });

    for (const user of seedUsers) {
      await tx
        .insert(users)
        .values({
          id: user.id,
          tenantId: seedTenant.id,
          email: user.email,
          passwordHash,
          displayName: user.name,
          role: user.role,
          status: user.status,
        })
        .onDuplicateKeyUpdate({
          set: {
            displayName: user.name,
            passwordHash,
            role: user.role,
            status: user.status,
          },
        });
    }

    for (const group of seedGroups) {
      await tx
        .insert(groups)
        .values({
          id: group.id,
          tenantId: seedTenant.id,
          name: group.name,
          externalId: group.externalId,
        })
        .onDuplicateKeyUpdate({ set: { name: group.name, externalId: group.externalId } });
    }

    await tx.delete(groupMembers).where(
      inArray(
        groupMembers.groupId,
        seedGroups.map((group) => group.id),
      ),
    );

    for (const user of seedUsers) {
      for (const groupId of user.groupIds) {
        await tx.insert(groupMembers).values({
          id: `gm-${user.id}-${groupId}`,
          groupId,
          userId: user.id,
        });
      }
    }

    for (const knowledgeBase of seedKnowledgeBases) {
      await tx
        .insert(knowledgeBases)
        .values({
          id: knowledgeBase.id,
          tenantId: seedTenant.id,
          name: knowledgeBase.name,
          description: knowledgeBase.description,
          ragflowDatasetId: knowledgeBase.ragflowDatasetId,
          embeddingModel: knowledgeBase.embeddingModel,
          aclVersion: 1,
          createdAt: new Date(knowledgeBase.createdAt),
          updatedAt: new Date(knowledgeBase.updatedAt),
          deletedAt: null,
        })
        .onDuplicateKeyUpdate({
          set: {
            name: knowledgeBase.name,
            description: knowledgeBase.description,
            ragflowDatasetId: knowledgeBase.ragflowDatasetId,
            embeddingModel: knowledgeBase.embeddingModel,
            aclVersion: 1,
            updatedAt: new Date(knowledgeBase.updatedAt),
            deletedAt: null,
          },
        });
    }

    for (const document of seedDocuments) {
      await tx
        .insert(documents)
        .values({
          id: document.id,
          tenantId: seedTenant.id,
          knowledgeBaseId: document.knowledgeBaseId,
          title: document.title,
          sourceKey: document.sourceKey,
          ragflowDocumentId: document.ragflowDocumentId,
          status: document.status,
          contentHash: null,
          createdAt: new Date(document.createdAt),
          updatedAt: new Date(document.updatedAt),
          deletedAt: null,
        })
        .onDuplicateKeyUpdate({
          set: {
            knowledgeBaseId: document.knowledgeBaseId,
            title: document.title,
            sourceKey: document.sourceKey,
            ragflowDocumentId: document.ragflowDocumentId,
            status: document.status,
            contentHash: null,
            updatedAt: new Date(document.updatedAt),
            deletedAt: null,
          },
        });
    }

    await tx.delete(knowledgeBaseAcls).where(
      inArray(
        knowledgeBaseAcls.knowledgeBaseId,
        seedKnowledgeBases.map((knowledgeBase) => knowledgeBase.id),
      ),
    );
    await tx.delete(documentAcls).where(
      inArray(
        documentAcls.documentId,
        seedDocuments.map((document) => document.id),
      ),
    );

    for (const knowledgeBase of seedKnowledgeBases) {
      for (const subject of knowledgeBase.defaultSubjects) {
        await tx.insert(knowledgeBaseAcls).values({
          id: randomUUID(),
          tenantId: seedTenant.id,
          knowledgeBaseId: knowledgeBase.id,
          subjectType: subject.type,
          subjectId: subject.id,
          permission: "read",
        });
      }
    }

    for (const document of seedDocuments) {
      for (const exception of document.exceptions) {
        await tx.insert(documentAcls).values({
          id: randomUUID(),
          tenantId: seedTenant.id,
          knowledgeBaseId: document.knowledgeBaseId,
          documentId: document.id,
          subjectType: exception.type,
          subjectId: exception.id,
          permission: exception.permission,
        });
      }
    }
  });

  console.log(
    `Seed complete: tenant=${seedTenant.id} users=${seedUsers.length} groups=${seedGroups.length} knowledgeBases=${seedKnowledgeBases.length} documents=${seedDocuments.length}`,
  );
}

seed()
  .catch((error: unknown) => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$client.end();
  });
