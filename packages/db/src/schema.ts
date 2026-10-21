import {
  bigint,
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const tenants = mysqlTable(
  "tenants",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("tenants_slug_uq").on(table.slug)],
);

export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    role: mysqlEnum("role", ["member", "knowledge_admin", "security_admin", "tenant_admin"])
      .default("member")
      .notNull(),
    status: mysqlEnum("status", ["active", "disabled"]).default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_tenant_email_uq").on(table.tenantId, table.email),
    index("users_tenant_idx").on(table.tenantId),
  ],
);

export const authSessions = mysqlTable(
  "auth_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_uq").on(table.tokenHash),
    index("auth_sessions_user_idx").on(table.userId),
    index("auth_sessions_expires_idx").on(table.expiresAt),
  ],
);

export const groups = mysqlTable(
  "groups",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    externalId: varchar("external_id", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("groups_tenant_name_uq").on(table.tenantId, table.name),
    index("groups_tenant_idx").on(table.tenantId),
  ],
);

export const groupMembers = mysqlTable(
  "group_members",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    groupId: varchar("group_id", { length: 36 })
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("group_members_uq").on(table.groupId, table.userId),
    index("group_members_user_idx").on(table.userId),
  ],
);

export const knowledgeBases = mysqlTable(
  "knowledge_bases",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    ragflowDatasetId: varchar("ragflow_dataset_id", { length: 64 }).notNull(),
    embeddingModel: varchar("embedding_model", { length: 120 }).notNull(),
    aclVersion: int("acl_version").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("knowledge_bases_tenant_name_uq").on(table.tenantId, table.name),
    index("knowledge_bases_tenant_idx").on(table.tenantId),
  ],
);

export const documents = mysqlTable(
  "documents",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    knowledgeBaseId: varchar("knowledge_base_id", { length: 36 })
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 512 }).notNull(),
    sourceKey: varchar("source_key", { length: 1024 }).notNull(),
    ragflowDocumentId: varchar("ragflow_document_id", { length: 64 }),
    status: mysqlEnum("status", ["pending", "parsing", "ready", "failed", "deleted"])
      .default("pending")
      .notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number", unsigned: true }),
    mimeType: varchar("mime_type", { length: 120 }),
    errorMessage: varchar("error_message", { length: 512 }),
    contentHash: varchar("content_hash", { length: 64 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("documents_tenant_kb_idx").on(table.tenantId, table.knowledgeBaseId),
    index("documents_ragflow_idx").on(table.ragflowDocumentId),
    index("documents_status_idx").on(table.status),
  ],
);

export const knowledgeBaseAcls = mysqlTable(
  "knowledge_base_acls",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    knowledgeBaseId: varchar("knowledge_base_id", { length: 36 })
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    subjectType: mysqlEnum("subject_type", ["user", "group"]).notNull(),
    subjectId: varchar("subject_id", { length: 36 }).notNull(),
    permission: mysqlEnum("permission", ["read", "deny"]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("knowledge_base_acls_uq").on(
      table.knowledgeBaseId,
      table.subjectType,
      table.subjectId,
    ),
    index("knowledge_base_acls_tenant_idx").on(table.tenantId),
    index("knowledge_base_acls_subject_idx").on(table.subjectType, table.subjectId),
  ],
);

export const documentAcls = mysqlTable(
  "document_acls",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    knowledgeBaseId: varchar("knowledge_base_id", { length: 36 })
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    documentId: varchar("document_id", { length: 36 })
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    subjectType: mysqlEnum("subject_type", ["user", "group"]).notNull(),
    subjectId: varchar("subject_id", { length: 36 }).notNull(),
    permission: mysqlEnum("permission", ["read", "deny"]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("document_acls_uq").on(table.documentId, table.subjectType, table.subjectId),
    index("document_acls_tenant_idx").on(table.tenantId),
    index("document_acls_subject_idx").on(table.subjectType, table.subjectId),
  ],
);

export const agentSessions = mysqlTable(
  "agent_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    modelProvider: varchar("model_provider", { length: 60 }).notNull(),
    modelId: varchar("model_id", { length: 120 }).notNull(),
    thinkingLevel: varchar("thinking_level", { length: 20 }).default("medium").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("agent_sessions_tenant_user_idx").on(table.tenantId, table.userId),
    index("agent_sessions_updated_idx").on(table.updatedAt),
  ],
);

export const messages = mysqlTable(
  "messages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    sessionId: varchar("session_id", { length: 36 })
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["user", "assistant", "tool", "system"]).notNull(),
    content: text("content").notNull(),
    metadata: json("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("messages_session_created_idx").on(table.sessionId, table.createdAt)],
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorId: varchar("actor_id", { length: 36 }),
    action: varchar("action", { length: 80 }).notNull(),
    resourceType: varchar("resource_type", { length: 60 }).notNull(),
    resourceId: varchar("resource_id", { length: 64 }),
    metadata: json("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("audit_logs_resource_idx").on(table.resourceType, table.resourceId),
  ],
);

export const modelConfigs = mysqlTable(
  "model_configs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 60 }).notNull(),
    modelId: varchar("model_id", { length: 120 }).notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    baseUrl: varchar("base_url", { length: 512 }),
    encryptedApiKey: text("encrypted_api_key"),
    enabled: boolean("enabled").default(true).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("model_configs_tenant_user_model_uq").on(
      table.tenantId,
      table.userId,
      table.provider,
      table.modelId,
    ),
    index("model_configs_user_idx").on(table.tenantId, table.userId),
  ],
);

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type KnowledgeBase = typeof knowledgeBases.$inferSelect;
export type KnowledgeBaseAcl = typeof knowledgeBaseAcls.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentAcl = typeof documentAcls.$inferSelect;
export type AgentSession = typeof agentSessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type ModelConfig = typeof modelConfigs.$inferSelect;
