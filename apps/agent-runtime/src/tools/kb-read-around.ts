import { defineTool } from "@earendil-works/pi-coding-agent";
import type { ChatCitation } from "@pichat/shared";
import { Type } from "typebox";
import { formatKbContext } from "./kb-context.js";
import { mapRetrievalError, resolveDocumentSource } from "./source.js";
import type { KbToolDetails, ToolRuntimeContext } from "./types.js";
import { ToolExecutionError } from "./types.js";

const parameters = Type.Object({
  citation: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "kb_search 返回的引用编号，例如 3 表示 [3]。与 document 二选一。",
    }),
  ),
  document: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 16,
      description: "kb_list_scope 返回的文档编号，例如 D1。与 citation 二选一。",
    }),
  ),
  chunkIndex: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "可选：从文档第几个片段开始读（从 1 开始），仅与 document 搭配使用，默认 1。",
    }),
  ),
  before: Type.Optional(
    Type.Integer({
      minimum: 0,
      maximum: 2,
      description: "可选：向前多读几个片段，默认 1，最大 2。",
    }),
  ),
  after: Type.Optional(
    Type.Integer({
      minimum: 0,
      maximum: 2,
      description: "可选：向后多读几个片段，默认 1，最大 2。",
    }),
  ),
});

const MAX_WINDOW = 2;

function truncate(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxChars - 12))}\n…（已截断）`;
}

export function createKbReadAroundTool(context: ToolRuntimeContext) {
  return defineTool({
    name: "kb_read_around",
    label: "kb.read_around",
    description:
      "按文档位置读取 kb_search 引用或 kb_list_scope 文档中某个片段的相邻内容。适用于表格、条款、步骤被切块后上下文不全的情况；不按相似度重新检索。返回标记为 adjacent 的上下文片段，并分配引用编号。",
    promptSnippet: "kb_read_around：按位置读取引用或文档片段的相邻内容。",
    promptGuidelines: [
      "当表格、条款、步骤或代码被切块，单个片段不足以理解时，用 kb_read_around 读取前后文。",
      "优先传 citation；只有从 kb_list_scope 或 kb_document_outline 拿到文档编号和片段位置时才用 document + chunkIndex。",
      "adjacent 片段是位置相邻的上下文，不是相似度证据；只有能直接支撑结论时才引用。",
      "不要用 kb_read_around 反复读取同一窗口，也不要把返回的文档编号展示给用户。",
    ],
    parameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal) => {
      const source = await resolveDocumentSource(
        context,
        { citation: params.citation, document: params.document },
        signal,
      );

      if (source.via === "citation" && params.chunkIndex !== undefined) {
        throw new ToolExecutionError(
          "invalid_arguments",
          "chunkIndex 只能与 document 搭配使用；citation 已经包含片段位置",
        );
      }

      const snapshot = await context.chunks
        .load(source.knowledgeBase.ragflowDatasetId, source.document.ragflowDocumentId)
        .catch((error: unknown) => {
          throw mapRetrievalError(error, "读取文档片段失败");
        });

      let targetIndex: number;
      if (source.via === "citation") {
        targetIndex = snapshot.chunks.findIndex((chunk) => chunk.id === source.chunkId);
        if (targetIndex < 0) {
          if (snapshot.truncated) {
            throw new ToolExecutionError(
              "document_too_large",
              "文档片段过多，暂时无法定位该引用；可先用 kb_find_in_document 缩小范围",
            );
          }
          throw new ToolExecutionError(
            "citation_stale",
            "该引用对应的片段已不存在，文档可能已重新解析；请重新调用 kb_search",
          );
        }
      } else {
        targetIndex = (params.chunkIndex ?? 1) - 1;
        if (targetIndex < 0 || targetIndex >= snapshot.chunks.length) {
          throw new ToolExecutionError(
            "chunk_not_found",
            `文档只有 ${snapshot.chunks.length} 个片段，无法从第 ${params.chunkIndex ?? 1} 个片段读取`,
          );
        }
      }

      const before = Math.min(Math.max(params.before ?? 1, 0), MAX_WINDOW);
      const after = Math.min(Math.max(params.after ?? 1, 0), MAX_WINDOW);
      const start = Math.max(0, targetIndex - before);
      const end = Math.min(snapshot.chunks.length - 1, targetIndex + after);

      const preferred = [targetIndex];
      for (let distance = 1; distance <= Math.max(before, after); distance += 1) {
        if (targetIndex - distance >= start) {
          preferred.push(targetIndex - distance);
        }
        if (targetIndex + distance <= end) {
          preferred.push(targetIndex + distance);
        }
      }

      const maxResultChars = context.config.search.maxResultChars;
      const maxSnippetChars = context.config.search.maxSnippetChars;
      const includedIndexes: number[] = [];
      let totalChars = 0;
      let omitted = 0;

      for (const index of preferred) {
        const chunk = snapshot.chunks[index];
        if (!chunk) {
          continue;
        }
        const snippet = truncate(chunk.content || "（空片段）", maxSnippetChars);
        const content = `片段 ${index + 1}：${snippet}`;
        if (totalChars + content.length > maxResultChars && includedIndexes.length > 0) {
          omitted += 1;
          continue;
        }
        includedIndexes.push(index);
        totalChars += content.length;
      }

      const included = [...includedIndexes]
        .sort((left, right) => left - right)
        .map((index) => {
          const chunk = snapshot.chunks[index];
          if (!chunk) {
            return undefined;
          }
          const snippet = truncate(chunk.content || "（空片段）", maxSnippetChars);
          const registration = context.citations.add({
            documentId: source.document.id,
            documentTitle: source.document.title,
            knowledgeBaseId: source.knowledgeBase.id,
            knowledgeBaseName: source.knowledgeBase.name,
            chunkId: chunk.id,
            snippet,
            ragflowDocumentId: source.document.ragflowDocumentId,
          });
          return { index, snippet, citation: registration.citation };
        })
        .filter(
          (item): item is { index: number; snippet: string; citation: ChatCitation } =>
            item !== undefined,
        );

      const text = formatKbContext(
        included.map((item) => ({
          index: item.citation.index,
          title: source.document.title,
          source: source.knowledgeBase.name,
          confidence: "adjacent" as const,
          content: `片段 ${item.index + 1}：${item.snippet}`,
        })),
      );

      const omittedNote = omitted > 0 ? `\n受长度限制，省略了 ${omitted} 个相邻片段。` : "";
      const summary = `读取《${source.document.title}》第 ${targetIndex + 1} 段，共 ${included.length} 段`;

      return {
        content: [{ type: "text" as const, text: `${text}${omittedNote}` }],
        details: {
          summary,
          citations: included.map((item) => item.citation),
        } satisfies KbToolDetails,
      };
    },
  });
}
