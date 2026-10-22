import { defineTool } from "@earendil-works/pi-coding-agent";
import { RAGFlowError, type RetrievalChunk } from "@pichat/ragflow-client";
import type { AccessScopeDocument, AccessScopeKnowledgeBase, ChatCitation } from "@pichat/shared";
import { Type } from "typebox";
import { AccessClientError } from "../clients/access-client.js";
import { type KbToolDetails, ToolExecutionError, type ToolRuntimeContext } from "./types.js";

const parameters = Type.Object({
  query: Type.String({
    minLength: 1,
    maxLength: 500,
    description: "要在当前用户有权阅读的知识库中检索的问题或关键词。",
  }),
  knowledgeBaseIds: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
      maxItems: 10,
      description: "可选：只在指定知识库中检索。权限仍由服务端计算。",
    }),
  ),
  topK: Type.Optional(
    Type.Number({
      minimum: 1,
      maximum: 12,
      description: "可选：返回的片段数量，默认由服务端配置决定。",
    }),
  ),
});

interface DocumentMeta {
  document: AccessScopeDocument;
  knowledgeBase: AccessScopeKnowledgeBase;
}

function truncate(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxChars - 12))}\n…（已截断）`;
}

function emptyResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    details: { summary: "未命中片段", citations: [] } satisfies KbToolDetails,
  };
}

export function createKbSearchTool(context: ToolRuntimeContext) {
  return defineTool({
    name: "kb_search",
    label: "kb.search",
    description:
      "在当前用户有权阅读的企业知识库中检索相关片段。返回带编号的片段，编号可用于 kb_read 和回答引用。",
    promptSnippet: "kb_search：在授权知识库中检索片段。",
    promptGuidelines: [
      "回答企业知识问题前先调用 kb_search。",
      "引用检索结果时使用返回的编号，例如 [1]。",
    ],
    parameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal) => {
      const ragflow = context.ragflow;
      if (!ragflow) {
        throw new ToolExecutionError("ragflow_not_configured", "知识库检索服务未配置");
      }

      const query = params.query.trim();
      if (query.length === 0) {
        throw new ToolExecutionError("invalid_query", "检索词不能为空");
      }

      const requestedTopK =
        params.topK === undefined
          ? undefined
          : Math.min(Math.max(params.topK, 1), context.config.search.maxTopK);

      const scope = await context.accessClient.scope(
        context.principal,
        params.knowledgeBaseIds?.map((id) => id.trim()).filter(Boolean),
        signal,
      );

      if (scope.knowledgeBases.length === 0) {
        return emptyResult("在你有权访问的知识库中未找到可检索的文档。");
      }

      const documentMeta = new Map<string, DocumentMeta>();
      for (const knowledgeBase of scope.knowledgeBases) {
        for (const document of knowledgeBase.documents) {
          documentMeta.set(document.ragflowDocumentId, { document, knowledgeBase });
        }
      }

      const topKFor = (knowledgeBase: (typeof scope.knowledgeBases)[number]) =>
        requestedTopK ??
        Math.min(
          Math.max(knowledgeBase.retrieval?.topK ?? context.config.search.topK, 1),
          context.config.search.maxTopK,
        );
      const finalTopK =
        requestedTopK ??
        Math.min(
          Math.max(
            ...scope.knowledgeBases.map(
              (knowledgeBase) => knowledgeBase.retrieval?.topK ?? context.config.search.topK,
            ),
            1,
          ),
          context.config.search.maxTopK,
        );

      const settled = await Promise.allSettled(
        scope.knowledgeBases.map((knowledgeBase) => {
          const knowledgeBaseTopK = topKFor(knowledgeBase);
          return ragflow.retrieve({
            question: query,
            datasetIds: [knowledgeBase.ragflowDatasetId],
            documentIds: knowledgeBase.documents.map((document) => document.ragflowDocumentId),
            topK: Math.max(knowledgeBaseTopK * 2, knowledgeBaseTopK),
            similarityThreshold:
              knowledgeBase.retrieval?.similarityThreshold ??
              context.config.search.similarityThreshold,
            vectorSimilarityWeight:
              knowledgeBase.retrieval?.vectorWeight ?? context.config.search.vectorWeight,
          });
        }),
      );

      const failures = settled.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      const chunks: RetrievalChunk[] = [];
      for (const result of settled) {
        if (result.status === "fulfilled") {
          chunks.push(...result.value);
        }
      }

      if (failures.length === settled.length && failures.length > 0) {
        throw toToolError(failures[0]?.reason);
      }

      const allowedAfterCheck = await recheckDocuments(context, documentMeta, chunks, signal);

      const seen = new Set<string>();
      const selected: Array<{ chunk: RetrievalChunk; meta: DocumentMeta }> = [];
      for (const chunk of chunks) {
        const meta = documentMeta.get(chunk.documentId);
        if (!meta || !allowedAfterCheck.has(meta.document.id)) {
          continue;
        }
        const key = chunk.id || `${chunk.documentId}:${chunk.content.slice(0, 64)}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        selected.push({ chunk, meta });
      }

      selected.sort((left, right) => right.chunk.similarity - left.chunk.similarity);

      const results: Array<{ citation: ChatCitation; snippet: string }> = [];
      let totalChars = 0;
      for (const item of selected.slice(0, finalTopK)) {
        const snippet = truncate(item.chunk.content, context.config.search.maxSnippetChars);
        if (
          results.length > 0 &&
          totalChars + snippet.length > context.config.search.maxResultChars
        ) {
          break;
        }
        totalChars += snippet.length;
        const registration = context.citations.add({
          documentId: item.meta.document.id,
          documentTitle: item.meta.document.title,
          knowledgeBaseId: item.meta.knowledgeBase.id,
          knowledgeBaseName: item.meta.knowledgeBase.name,
          chunkId: item.chunk.id,
          snippet,
          ragflowDocumentId: item.meta.document.ragflowDocumentId,
        });
        results.push({ citation: registration.citation, snippet });
      }

      if (results.length === 0) {
        return emptyResult("在你有权访问的知识库中未找到与问题相关的片段。");
      }

      const text = results
        .map(
          ({ citation, snippet }) =>
            `[${citation.index}] 《${citation.documentTitle}》 / ${citation.knowledgeBaseName}\n${snippet}`,
        )
        .join("\n\n");

      const documentCount = new Set(results.map((result) => result.citation.documentId)).size;
      const summary = `命中 ${results.length} 个片段，涉及 ${documentCount} 份文档`;

      return {
        content: [{ type: "text" as const, text }],
        details: {
          summary,
          citations: results.map((result) => result.citation),
        } satisfies KbToolDetails,
      };
    },
  });
}

async function recheckDocuments(
  context: ToolRuntimeContext,
  documentMeta: Map<string, DocumentMeta>,
  chunks: RetrievalChunk[],
  signal: AbortSignal | undefined,
): Promise<Set<string>> {
  const candidateIds = new Set<string>();
  for (const chunk of chunks) {
    const meta = documentMeta.get(chunk.documentId);
    if (meta) {
      candidateIds.add(meta.document.id);
    }
  }

  if (candidateIds.size === 0) {
    return new Set();
  }

  const checks = await Promise.allSettled(
    [...candidateIds].map(async (documentId) => {
      const result = await context.accessClient.check(context.principal, documentId, signal);
      return { documentId, allowed: result.allowed };
    }),
  );

  const failures = checks.filter(
    (check): check is PromiseRejectedResult => check.status === "rejected",
  );
  if (failures.length === checks.length) {
    throw toToolError(failures[0]?.reason);
  }

  const allowed = new Set<string>();
  for (const check of checks) {
    if (check.status === "fulfilled" && check.value.allowed) {
      allowed.add(check.value.documentId);
    }
  }
  return allowed;
}

function toToolError(reason: unknown): ToolExecutionError {
  if (reason instanceof ToolExecutionError) {
    return reason;
  }
  if (reason instanceof AccessClientError) {
    return new ToolExecutionError("access_unavailable", "权限服务暂时不可用");
  }
  if (reason instanceof RAGFlowError) {
    return new ToolExecutionError("ragflow_error", "知识库检索失败");
  }
  return new ToolExecutionError("retrieval_failed", "知识库检索失败");
}
