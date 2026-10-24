import type { AccessReason } from "./api.js";
import type { ThinkingLevel } from "./domain.js";

export interface InternalPrincipal {
  tenantId: string;
  userId: string;
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

export interface AccessScopeRetrievalSettings {
  topK: number;
  similarityThreshold: number;
  vectorWeight: number;
  rerankModelId?: string | null;
}

export interface AccessScopeKnowledgeBase {
  id: string;
  name: string;
  ragflowDatasetId: string;
  retrieval: AccessScopeRetrievalSettings;
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

export interface ChatRunWebSearchConfig {
  provider: string;
  apiKey: string;
  proxy?: string;
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
  webSearch: boolean;
  webSearchConfig?: ChatRunWebSearchConfig;
  knowledgeBaseIds?: string[];
}
