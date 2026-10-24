import { defineTool } from "@earendil-works/pi-coding-agent";
import type { AccessScopeKnowledgeBase, AccessScopeResponse } from "@pichat/shared";
import { Type } from "typebox";
import { AccessClientError } from "../clients/access-client.js";
import { escapeKbText } from "./kb-context.js";
import type { KbToolDetails, ToolRuntimeContext } from "./types.js";
import { ToolExecutionError } from "./types.js";

const parameters = Type.Object({
  query: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 100,
      description: "可选：按知识库名称或文档标题过滤，例如“差旅”“合同”。",
    }),
  ),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 50,
      description: "可选：最多列出的文档数量，默认 30，最大 50。",
    }),
  ),
});

interface MatchedDocument {
  knowledgeBase: AccessScopeKnowledgeBase;
  document: AccessScopeKnowledgeBase["documents"][number];
}

export function createKbListScopeTool(context: ToolRuntimeContext) {
  return defineTool({
    name: "kb_list_scope",
    label: "kb.list",
    description:
      "列出当前用户有权阅读的知识库和文档，并返回本次回答内有效的文档编号（如 D1）。仅在用户询问“有哪些资料/知识库”、需要确认知识覆盖范围，或需要选择具体文档继续读取时调用。普通问答不要调用。",
    promptSnippet: "kb_list_scope：列出有权阅读的知识库和文档。",
    promptGuidelines: [
      "用户问“有哪些知识库/文档/资料”“有没有覆盖某主题”时，先调用 kb_list_scope。",
      "返回的 D1、D2 是本次回答内的文档编号，只能传给 kb_read_around、kb_find_in_document、kb_document_outline。",
      "不要把文档编号、知识库内部 ID 或文档内部 ID 展示给用户；向用户只描述知识库名称、文档标题和数量。",
      "不要为了普通事实问答枚举整个知识库。",
    ],
    parameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal) => {
      if (context.knowledgeBaseIds !== undefined && context.knowledgeBaseIds.length === 0) {
        return {
          content: [{ type: "text" as const, text: "本次对话未选择知识库。" }],
          details: { summary: "未选择知识库", citations: [] } satisfies KbToolDetails,
        };
      }

      let scope: AccessScopeResponse;
      try {
        scope = await context.accessClient.scope(
          context.principal,
          context.knowledgeBaseIds,
          signal,
        );
      } catch (error) {
        if (error instanceof AccessClientError) {
          throw new ToolExecutionError("access_unavailable", "权限服务暂时不可用");
        }
        throw error;
      }

      const totalDocuments = scope.knowledgeBases.reduce(
        (sum, knowledgeBase) => sum + knowledgeBase.documents.length,
        0,
      );
      const query = params.query?.trim() ?? "";
      const normalizedQuery = query.toLocaleLowerCase();
      const matched: MatchedDocument[] = [];

      for (const knowledgeBase of scope.knowledgeBases) {
        const knowledgeBaseMatches =
          normalizedQuery.length > 0 &&
          knowledgeBase.name.toLocaleLowerCase().includes(normalizedQuery);
        for (const document of knowledgeBase.documents) {
          if (
            normalizedQuery.length === 0 ||
            knowledgeBaseMatches ||
            document.title.toLocaleLowerCase().includes(normalizedQuery)
          ) {
            matched.push({ knowledgeBase, document });
          }
        }
      }

      if (matched.length === 0) {
        const text =
          totalDocuments === 0
            ? "当前账号没有可读取的知识库文档。"
            : `当前账号可读 ${scope.knowledgeBases.length} 个知识库、${totalDocuments} 份文档，但没有匹配「${escapeKbText(query)}」的文档。`;
        return {
          content: [{ type: "text" as const, text }],
          details: { summary: "没有匹配的可读文档", citations: [] } satisfies KbToolDetails,
        };
      }

      const limit = params.limit ?? 30;
      const selected = matched.slice(0, limit);
      const grouped = new Map<
        string,
        { knowledgeBase: AccessScopeKnowledgeBase; documents: MatchedDocument[] }
      >();

      for (const item of selected) {
        const group = grouped.get(item.knowledgeBase.id) ?? {
          knowledgeBase: item.knowledgeBase,
          documents: [],
        };
        group.documents.push(item);
        grouped.set(item.knowledgeBase.id, group);
      }

      const lines = [
        `当前账号可读 ${scope.knowledgeBases.length} 个知识库、${totalDocuments} 份文档。`,
      ];
      if (query.length > 0) {
        lines.push(`按「${escapeKbText(query)}」筛选后匹配 ${matched.length} 份文档。`);
      }

      for (const group of grouped.values()) {
        const totalInKnowledgeBase = group.knowledgeBase.documents.length;
        const listedInKnowledgeBase = group.documents.length;
        lines.push("");
        lines.push(
          `[${escapeKbText(group.knowledgeBase.name)}] 共 ${totalInKnowledgeBase} 份，列出 ${listedInKnowledgeBase} 份`,
        );
        for (const item of group.documents) {
          const entry = context.documents.register(item.document, item.knowledgeBase);
          lines.push(`- ${entry.handle} 《${escapeKbText(item.document.title)}》`);
        }
      }

      if (selected.length < matched.length) {
        lines.push("");
        lines.push(
          `仅列出前 ${selected.length} 份，还有 ${matched.length - selected.length} 份未列出；可使用 query 缩小范围。`,
        );
      }

      const text = `<kb_scope>\n${lines.join("\n")}\n</kb_scope>`;
      const summary =
        query.length > 0
          ? `可读 ${scope.knowledgeBases.length} 个知识库，筛选后 ${matched.length} 份文档`
          : `可读 ${scope.knowledgeBases.length} 个知识库、${totalDocuments} 份文档`;

      return {
        content: [{ type: "text" as const, text }],
        details: { summary, citations: [] } satisfies KbToolDetails,
      };
    },
  });
}
