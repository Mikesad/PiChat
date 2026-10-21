import type { DocumentStatus, UserRole } from "./domain.js";

export const sessionCookieName = "pichat_session";
export const sessionTtlSeconds = 7 * 24 * 60 * 60;

export type AclSubjectType = "user" | "group";
export type AclPermission = "read" | "deny";
export type AccessReason = "allowed" | "explicit_deny" | "no_grant" | "role_override";

export interface AclSubject {
  type: AclSubjectType;
  id: string;
}

export interface AclException extends AclSubject {
  permission: AclPermission;
}

export interface SessionUser {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: UserRole;
  groupIds: string[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SessionResponse {
  user: SessionUser;
}

export type ApiErrorCode =
  | "invalid_request"
  | "user_not_found"
  | "invalid_password"
  | "account_disabled"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "internal_error";

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
}

export interface KnowledgeBaseSummary {
  id: string;
  name: string;
  description: string | null;
  embeddingModel: string;
  ragflowDatasetId: string;
  aclVersion: number;
  defaultSubjects: AclSubject[];
  documentCount: number;
  readableDocumentCount: number;
  canManageAcl: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSummary {
  id: string;
  knowledgeBaseId: string;
  title: string;
  status: DocumentStatus;
  sourceKey: string;
  ragflowDocumentId: string | null;
  sizeLabel: string | null;
  exceptions: AclException[];
  effectiveReaderCount: number;
  canManageAcl: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseListResponse {
  knowledgeBases: KnowledgeBaseSummary[];
}

export interface KnowledgeBaseResponse {
  knowledgeBase: KnowledgeBaseSummary;
}

export interface DocumentListResponse {
  documents: DocumentSummary[];
}

export interface UpdateDocumentAclRequest {
  exceptions: AclException[];
}

export interface UpdateDocumentAclResponse {
  aclVersion: number;
  document: DocumentSummary;
}

export interface UpdateKnowledgeBaseAclRequest {
  defaultSubjects: AclSubject[];
}

export interface UpdateKnowledgeBaseAclResponse {
  aclVersion: number;
  knowledgeBase: KnowledgeBaseSummary;
}

export interface AccessCheckRequest {
  documentId: string;
}

export interface AccessCheckResponse {
  allowed: boolean;
  reason: AccessReason;
  effectiveReaderCount: number;
}
