import { defineTool } from "@earendil-works/pi-coding-agent";
import type { ChatCitation } from "@pichat/shared";
import { Type } from "typebox";
import { escapeKbText, formatKbContext } from "./kb-context.js";
import { mapRetrievalError, resolveDocumentSource } from "./source.js";
import type { KbToolDetails, ToolRuntimeContext } from "./types.js";
import { ToolExecutionError } from "./types.js";

const parameters = Type.Object({
  query: Type.String({
    minLength: 1,
    maxLength: 200,
    description:
      "要精确查找的字面量文本，例如合同编号、错误码、型号、条款号、日期或专有名词。不是语义检索。",
  }),
  citation: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "kb_search 返回的引用编号，用于确定要查找的文档。与 document 二选一。",
    }),
  ),
  document: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 16,
      description: "kb_list_scope 返回的文档编号，例如 D1。与 citation 二选一。",
    }),
  ),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 10,
      description: "可选：最多返回多少个命中片段，默认 5，最大 10。",
    }),
  ),
});

const MAX_EXCERPTS_PER_CHUNK = 3;
const CONTEXT_BEFORE = 120;
const CONTEXT_AFTER = 180;

interface MatchResult {
  chunkIndex: number;
  count: number;
  excerpts: string[];
  snippet: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function truncate(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxChars - 12))}\n…（已截断）`;
}

function buildExcerpt(content: string, start: number, length: number): string {
  const from = Math.max(0, start - CONTEXT_BEFORE);
  const to = Math.min(content.length, start + length + CONTEXT_AFTER);
  const prefix = from > 0 ? "…" : "";
  const suffix = to < content.length ? "…" : "";
  return `${prefix}${content.slice(from, to).trim()}${suffix}`;
}

function findMatches(
  chunks: Array<{ content: string }>,
  query: string,
  limit: number,
  maxSnippetChars: number,
): MatchResult[] {
  const pattern = new RegExp(escapeRegExp(query), "gi");
  const results: MatchResult[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!chunk) {
      continue;
    }
    const occurrences = [...chunk.content.matchAll(pattern)];
    if (occurrences.length === 0) {
      continue;
    }
    const excerpts = occurrences
      .slice(0, MAX_EXCERPTS_PER_CHUNK)
      .map((occurrence) => buildExcerpt(chunk.content, occurrence.index ?? 0, query.length));
    const snippet = truncate(excerpts.join("\n…\n"), maxSnippetChars);
    results.push({
      chunkIndex: index,
      count: occurrences.length,
      excerpts,
      snippet,
    });
    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

export function createKbFindInDocumentTool(context: ToolRuntimeContext) {
  return defineTool({
    name: "kb_find_in_document",
    label: "kb.find",
    description:
      "在 kb_search 引用所属文档或 kb_list_scope 指定文档中按字面量精确查找文本，返回命中位置及上下文。适用于合同编号、错误码、型号、条款号、日期等向量检索不稳定的精确匹配；不做语义检索。",
    promptSnippet: "kb_find_in_document：在指定文档内按字面量精确查找。",
    promptGuidelines: [
      "需要查找编号、错误码、型号、条款号、日期等精确字符串时，优先用 kb_find_in_document，而不是反复改 kb_search 关键词。",
      "只能用 citation 或 document 指定一份已授权文档；不要猜测文档编号。",
      "命中结果是 exact 类型的上下文，仍需判断是否直接回答用户问题。",
    ],
    parameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal) => {
      const query = params.query.trim();
      if (query.length === 0) {
        throw new ToolExecutionError("invalid_arguments", "查找内容不能为空");
      }

      const source = await resolveDocumentSource(
        context,
        { citation: params.citation, document: params.document },
        signal,
      );
      const snapshot = await context.chunks
        .load(source.knowledgeBase.ragflowDatasetId, source.document.ragflowDocumentId)
        .catch((error: unknown) => {
          throw mapRetrievalError(error, "读取文档片段失败");
        });

      const limit = params.limit ?? 5;
      const matches = findMatches(
        snapshot.chunks,
        query,
        limit,
        context.config.search.maxSnippetChars,
      );

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `在《${escapeKbText(source.document.title)}》中没有找到「${escapeKbText(query)}」。可以换一个关键词，或改用 kb_search 进行语义检索。`,
            },
          ],
          details: {
            summary: `《${source.document.title}》未命中「${query}」`,
            citations: [],
          } satisfies KbToolDetails,
        };
      }

      const citations: ChatCitation[] = [];
      const documents = matches.map((match) => {
        const chunk = snapshot.chunks[match.chunkIndex];
        if (!chunk) {
          throw new ToolExecutionError("chunk_not_found", "命中片段已失效，请重新读取文档");
        }
        const registration = context.citations.add({
          documentId: source.document.id,
          documentTitle: source.document.title,
          knowledgeBaseId: source.knowledgeBase.id,
          knowledgeBaseName: source.knowledgeBase.name,
          chunkId: chunk.id,
          snippet: match.snippet,
          ragflowDocumentId: source.document.ragflowDocumentId,
        });
        citations.push(registration.citation);
        return {
          index: registration.citation.index,
          title: source.document.title,
          source: source.knowledgeBase.name,
          confidence: "exact" as const,
          content: `片段 ${match.chunkIndex + 1}（命中 ${match.count} 处）：\n${match.snippet}`,
        };
      });

      const totalOccurrences = matches.reduce((sum, match) => sum + match.count, 0);
      const truncatedNote = snapshot.truncated
        ? `\n文档片段较多，本次只检索了前 ${snapshot.chunks.length} 个片段。`
        : "";
      const text = `${formatKbContext(documents)}${truncatedNote}`;

      return {
        content: [{ type: "text" as const, text }],
        details: {
          summary: `在《${source.document.title}》中找到 ${totalOccurrences} 处「${query}」，涉及 ${matches.length} 个片段`,
          citations,
        } satisfies KbToolDetails,
      };
    },
  });
}
