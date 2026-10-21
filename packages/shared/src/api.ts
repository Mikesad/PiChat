import type { DocumentStatus, UserRole } from "./domain.js";
import type { ModelProviderId } from "./model-config.js";

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
  | "service_unavailable"
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
  mimeType: string | null;
  errorMessage: string | null;
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

export interface ModelConfigSummary {
  id: string;
  provider: ModelProviderId;
  modelId: string;
  displayName: string;
  baseUrl: string;
  isDefault: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelConfigListResponse {
  modelConfigs: ModelConfigSummary[];
}

export interface ModelConfigResponse {
  modelConfig: ModelConfigSummary;
}

export interface CreateModelConfigRequest {
  provider: ModelProviderId;
  modelId: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  makeDefault?: boolean;
}

export interface UpdateModelConfigRequest {
  provider: ModelProviderId;
  modelId: string;
  displayName: string;
  baseUrl: string;
  apiKey?: string;
  makeDefault?: boolean;
}

export interface UploadDocumentResponse {
  document: DocumentSummary;
}

export interface ReparseDocumentResponse {
  document: DocumentSummary;
}

export function formatSizeLabel(sizeBytes: number | null | undefined): string | null {
  if (sizeBytes === null || sizeBytes === undefined || !Number.isFinite(sizeBytes)) {
    return null;
  }
  if (sizeBytes < 1024) {
    return `${Math.max(0, Math.round(sizeBytes))} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
