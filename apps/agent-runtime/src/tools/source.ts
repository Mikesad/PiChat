import { RAGFlowError } from "@pichat/ragflow-client";
import type { AccessScopeDocument, AccessScopeKnowledgeBase } from "@pichat/shared";
import { AccessClientError } from "../clients/access-client.js";
import { ToolExecutionError, type ToolRuntimeContext } from "./types.js";

export interface DocumentSourceParams {
  citation?: number;
  document?: string;
}

export interface ResolvedDocumentSource {
  knowledgeBase: AccessScopeKnowledgeBase;
  document: AccessScopeDocument;
  chunkId?: string;
  via: "citation" | "document";
}

export async function resolveDocumentSource(
  context: ToolRuntimeContext,
  params: DocumentSourceParams,
  signal: AbortSignal | undefined,
): Promise<ResolvedDocumentSource> {
  if (params.citation !== undefined && params.document !== undefined) {
    throw new ToolExecutionError(
      "invalid_arguments",
      "citation 和 document 只能二选一：引用编号来自 kb_search，文档编号来自 kb_list_scope",
    );
  }

  let knowledgeBaseId: string;
  let documentId: string;
  let chunkId: string | undefined;
  let via: "citation" | "document";

  if (params.citation !== undefined) {
    const ref = context.citations.get(params.citation);
    if (!ref) {
      throw new ToolExecutionError(
        "citation_not_found",
        "引用编号不存在或已失效，请先调用 kb_search 获取有效编号",
      );
    }
    knowledgeBaseId = ref.citation.knowledgeBaseId;
    documentId = ref.citation.documentId;
    chunkId = ref.citation.chunkId;
    via = "citation";
  } else if (params.document !== undefined) {
    const entry = context.documents.get(params.document);
    if (!entry) {
      throw new ToolExecutionError(
        "document_not_found",
        "文档编号不存在或已失效，请先调用 kb_list_scope 获取有效编号",
      );
    }
    knowledgeBaseId = entry.knowledgeBase.id;
    documentId = entry.document.id;
    via = "document";
  } else {
    throw new ToolExecutionError(
      "invalid_arguments",
      "需要 citation（kb_search 返回的引用编号）或 document（kb_list_scope 返回的文档编号）",
    );
  }

  try {
    if (
      context.knowledgeBaseIds !== undefined &&
      !context.knowledgeBaseIds.includes(knowledgeBaseId)
    ) {
      context.citations.remove(documentId);
      throw new ToolExecutionError("access_revoked", "该文档不在本次对话选择的知识库范围内。");
    }

    const scope = await context.accessClient.scope(context.principal, [knowledgeBaseId], signal);
    const knowledgeBase = scope.knowledgeBases.find((item) => item.id === knowledgeBaseId);
    const document = knowledgeBase?.documents.find((item) => item.id === documentId);
    if (!knowledgeBase || !document) {
      context.citations.remove(documentId);
      throw new ToolExecutionError("access_revoked", "该文档权限已变更，无法继续读取");
    }

    const check = await context.accessClient.check(context.principal, documentId, signal);
    if (!check.allowed) {
      context.citations.remove(documentId);
      throw new ToolExecutionError("access_revoked", "该文档权限已变更，无法继续读取");
    }

    return { knowledgeBase, document, chunkId, via };
  } catch (error) {
    if (error instanceof AccessClientError) {
      throw new ToolExecutionError("access_unavailable", "权限服务暂时不可用");
    }
    throw error;
  }
}

export function mapRetrievalError(error: unknown, message: string): ToolExecutionError {
  if (error instanceof ToolExecutionError) {
    return error;
  }
  if (error instanceof AccessClientError) {
    return new ToolExecutionError("access_unavailable", "权限服务暂时不可用");
  }
  if (error instanceof RAGFlowError) {
    return new ToolExecutionError("ragflow_error", message);
  }
  return new ToolExecutionError("retrieval_failed", message);
}
