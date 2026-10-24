export type TenantId = string;
export type UserId = string;
export type GroupId = string;
export type DepartmentId = string;
export type KnowledgeBaseId = string;
export type DocumentId = string;
export type SessionId = string;

export type UserRole = "member" | "knowledge_admin" | "security_admin" | "tenant_admin";

export type DocumentStatus = "pending" | "parsing" | "ready" | "failed" | "deleted";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface Principal {
  tenantId: TenantId;
  userId: UserId;
  role: UserRole;
  departmentId: DepartmentId | null;
}

export interface Citation {
  documentId: DocumentId;
  documentTitle: string;
  chunkId: string;
  knowledgeBaseId: KnowledgeBaseId;
  snippet: string;
}
