import type { AccessReason } from "./api.js";
import type { ThinkingLevel, UserRole } from "./domain.js";

export interface InternalPrincipal {
  tenantId: string;
  userId: string;
  role: UserRole;
  groupIds: string[];
}

export interface AccessScopeRequest {
  principal: InternalPrincipal;
  knowledgeBaseIds?: string[];
}

export interface AccessScopeDocument {
  id: string;
  title: string;
  ragflowDocumentId: string;
}

export interface AccessScopeKnowledgeBase {
  id: string;
  name: string;
  ragflowDatasetId: string;
  documents: AccessScopeDocument[];
}

export interface AccessScopeResponse {
  knowledgeBases: AccessScopeKnowledgeBase[];
}

export interface InternalAccessCheckRequest {
  principal: InternalPrincipal;
  documentId: string;
}

export interface AccessCheckResult {
  allowed: boolean;
  reason: AccessReason;
}

export interface ChatRunHistoryMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ChatRunModel {
  provider: string;
  modelId: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
}

export interface ChatRunRequest {
  runId: string;
  sessionId: string;
  assistantMessageId: string;
  principal: InternalPrincipal;
  model: ChatRunModel;
  thinkingLevel: ThinkingLevel;
  history: ChatRunHistoryMessage[];
  prompt: string;
}
