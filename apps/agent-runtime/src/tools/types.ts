import type { RAGFlowClient } from "@pichat/ragflow-client";
import type { ChatCitation, InternalPrincipal } from "@pichat/shared";
import type { AccessClient } from "../clients/access-client.js";
import type { RuntimeConfig } from "../config.js";
import type { CitationRegistry } from "../runtime/citation-registry.js";
import type { ChunkStore } from "./chunk-store.js";
import type { DocumentRegistry } from "./document-registry.js";

export interface ToolRuntimeContext {
  principal: InternalPrincipal;
  accessClient: AccessClient;
  ragflow: RAGFlowClient | null;
  citations: CitationRegistry;
  documents: DocumentRegistry;
  chunks: ChunkStore;
  config: RuntimeConfig;
  knowledgeBaseIds?: string[];
}

export interface KbToolDetails {
  summary: string;
  citations: ChatCitation[];
}

export class ToolExecutionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ToolExecutionError";
    this.code = code;
  }
}
