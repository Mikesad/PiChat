import type { DocumentStatus, UserRole } from "./domain.js";
import type { ModelKind, ModelProviderId } from "./model-config.js";
import type { SearchEngineProviderId } from "./search-config.js";

export const sessionCookieName = "pichat_session";
export const sessionTtlSeconds = 7 * 24 * 60 * 60;

export const minPageSize = 10;
export const maxPageSize = 100;
export const defaultPageSize = minPageSize;

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export type AclSubjectType = "user" | "group";
export type AclPermission = "read" | "deny";
export type DocumentAclMode = "inherit" | "restricted";
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
  departmentId: string | null;
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
  ownerId: string | null;
  ownerDepartmentId: string | null;
  ragflowDatasetId: string;
  retrievalTopK: number;
  retrievalSimilarityThreshold: number;
  retrievalVectorWeight: number;
  aclVersion: number;
  defaultSubjects: AclSubject[];
  deniedSubjects: AclSubject[];
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
  aclMode: DocumentAclMode;
  sizeLabel: string | null;
  mimeType: string | null;
  errorMessage: string | null;
  exceptions: AclException[];
  effectiveReaderCount: number;
  canRead: boolean;
  canManageAcl: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeBaseRequest {
  name: string;
  description?: string;
  embeddingModel?: string;
  embeddingConfigId?: string;
  ownerDepartmentId?: string | null;
}

export interface CreateKnowledgeBaseResponse {
  knowledgeBase: KnowledgeBaseSummary;
}

export interface KnowledgeBaseListResponse {
  knowledgeBases: KnowledgeBaseSummary[];
  pagination: PaginationMeta;
}

export interface KnowledgeBaseResponse {
  knowledgeBase: KnowledgeBaseSummary;
}

export interface UpdateKnowledgeBaseRequest {
  name?: string;
  description?: string;
  ownerDepartmentId?: string | null;
  retrievalTopK?: number;
  retrievalSimilarityThreshold?: number;
  retrievalVectorWeight?: number;
}

export interface UpdateKnowledgeBaseResponse {
  knowledgeBase: KnowledgeBaseSummary;
}

export interface MemberSummary {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: "active" | "disabled";
  departmentId: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  externalId: string | null;
  memberCount: number;
}

export interface MemberListResponse {
  members: MemberSummary[];
  groups: GroupSummary[];
  pagination: PaginationMeta;
}

export interface DirectoryMember {
  id: string;
  displayName: string;
  role: UserRole;
  status: "active" | "disabled";
  departmentId: string | null;
}

export interface DirectoryGroup {
  id: string;
  name: string;
  memberCount: number;
}

export interface DirectoryResponse {
  members: DirectoryMember[];
  groups: DirectoryGroup[];
}

export interface MemberResponse {
  member: MemberSummary;
}

export interface UpdateMemberRequest {
  role?: UserRole;
  status?: "active" | "disabled";
  departmentId?: string | null;
}

export interface ResetMemberPasswordRequest {
  password: string;
}

export type AuditResult = "success" | "denied" | "failed";

export interface AuditLogSummary {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceLabel: string | null;
  result: AuditResult;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogListResponse {
  logs: AuditLogSummary[];
  pagination: PaginationMeta;
}

export interface DocumentListResponse {
  documents: DocumentSummary[];
  pagination: PaginationMeta;
}

export interface UpdateDocumentAclRequest {
  exceptions: AclException[];
}

export interface UpdateDocumentAclResponse {
  aclVersion: number;
  document: DocumentSummary;
}

export interface UpdateDocumentAclModeRequest {
  mode: DocumentAclMode;
}

export interface UpdateDocumentAclModeResponse {
  aclVersion: number;
  document: DocumentSummary;
}

export interface BatchUpdateDocumentAclRequest {
  documentIds: string[];
  exceptions: AclException[];
  mode?: "replace";
}

export interface BatchUpdateDocumentAclResponse {
  aclVersion: number;
  documents: DocumentSummary[];
}

export interface UpdateKnowledgeBaseAclRequest {
  defaultSubjects: AclSubject[];
  deniedSubjects?: AclSubject[];
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
  kind: ModelKind;
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
  kind: ModelKind;
  provider: ModelProviderId;
  modelId: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  makeDefault?: boolean;
}

export interface UpdateModelConfigRequest {
  kind: ModelKind;
  provider: ModelProviderId;
  modelId: string;
  displayName: string;
  baseUrl: string;
  apiKey?: string;
  makeDefault?: boolean;
}

export interface SearchConfigSummary {
  id: string;
  provider: SearchEngineProviderId;
  name: string;
  remark: string;
  proxy: string;
  isDefault: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchConfigListResponse {
  searchConfigs: SearchConfigSummary[];
}

export interface SearchConfigResponse {
  searchConfig: SearchConfigSummary;
}

export interface CreateSearchConfigRequest {
  provider: SearchEngineProviderId;
  name: string;
  remark?: string;
  apiKey: string;
  proxy?: string;
  makeDefault?: boolean;
}

export interface UpdateSearchConfigRequest {
  provider: SearchEngineProviderId;
  name: string;
  remark?: string;
  apiKey?: string;
  proxy?: string;
  makeDefault?: boolean;
}

export interface TestSearchConfigRequest {
  id?: string;
  provider: SearchEngineProviderId;
  apiKey?: string;
  proxy?: string;
}

export interface TestSearchConfigResponse {
  ok: boolean;
  message: string;
  latencyMs: number;
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
