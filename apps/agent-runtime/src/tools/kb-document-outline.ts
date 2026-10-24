import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { escapeKbText } from "./kb-context.js";
import { mapRetrievalError, resolveDocumentSource } from "./source.js";
import type { KbToolDetails, ToolRuntimeContext } from "./types.js";

const parameters = Type.Object({
  citation: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "kb_search 返回的引用编号，用于确定文档。与 document 二选一。",
    }),
  ),
  document: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 16,
      description: "kb_list_scope 返回的文档编号，例如 D1。与 citation 二选一。",
    }),
  ),
  maxSections: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 60,
      description: "可选：最多返回多少个章节，默认 30，最大 60。",
    }),
  ),
});

interface OutlineSection {
  label: string;
  chunkIndex: number;
  level: number;
}

const MAX_HEADING_LENGTH = 120;
const MAX_HEADINGS_PER_CHUNK = 6;

function matchHeading(line: string): { label: string; level: number } | null {
  if (line.length > MAX_HEADING_LENGTH) {
    return null;
  }

  const markdown = /^(#{1,6})\s+(.+)$/u.exec(line);
  if (markdown?.[1] && markdown[2]) {
    return { label: markdown[2].trim(), level: markdown[1].length };
  }

  if (/^第[0-9一二三四五六七八九十百千万零〇两]+[章节篇部]/u.test(line)) {
    return { label: line, level: 1 };
  }

  const chineseNumbered = /^[一二三四五六七八九十]+[、.．]\s*(.+)$/u.exec(line);
  if (chineseNumbered?.[1] && !/[。；;，,]$/u.test(line)) {
    return { label: line, level: 2 };
  }

  const numbered = /^(\d+(?:\.\d+){0,3})[、.．]?\s+(.+)$/u.exec(line);
  if (numbered?.[1] && numbered[2] && !/[。；;，,]$/u.test(line)) {
    const level = Math.min(numbered[1].split(".").length + 1, 4);
    return { label: line, level };
  }

  return null;
}

function detectHeadings(content: string): Array<{ label: string; level: number }> {
  const headings: Array<{ label: string; level: number }> = [];
  const seen = new Set<string>();

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const heading = matchHeading(trimmed);
    if (!heading || seen.has(heading.label)) {
      continue;
    }
    seen.add(heading.label);
    headings.push(heading);
    if (headings.length >= MAX_HEADINGS_PER_CHUNK) {
      break;
    }
  }

  return headings;
}

function extractOutline(
  chunks: Array<{ content: string }>,
  maxSections: number,
): { sections: OutlineSection[]; inferred: boolean } {
  const sections: OutlineSection[] = [];
  let previousLabel = "";

  for (let index = 0; index < chunks.length && sections.length < maxSections; index += 1) {
    const chunk = chunks[index];
    if (!chunk) {
      continue;
    }
    for (const heading of detectHeadings(chunk.content)) {
      if (heading.label === previousLabel) {
        continue;
      }
      previousLabel = heading.label;
      sections.push({ ...heading, chunkIndex: index });
      if (sections.length >= maxSections) {
        break;
      }
    }
  }

  if (sections.length > 0) {
    return { sections, inferred: false };
  }

  const step = Math.max(1, Math.ceil(chunks.length / maxSections));
  for (let index = 0; index < chunks.length && sections.length < maxSections; index += step) {
    const chunk = chunks[index];
    if (!chunk) {
      continue;
    }
    const firstLine = firstNonEmptyLine(chunk.content) ?? "（空片段）";
    sections.push({
      label: firstLine.slice(0, 80),
      chunkIndex: index,
      level: 1,
    });
  }
  return { sections, inferred: true };
}

function firstNonEmptyLine(content: string): string | undefined {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

export function createKbDocumentOutlineTool(context: ToolRuntimeContext) {
  return defineTool({
    name: "kb_document_outline",
    label: "kb.outline",
    description:
      "返回指定文档的章节/片段目录，用于先定位结构再精读。目录从片段标题推断，可能不完整；适合用户询问文档结构、章节内容位置，或宽泛问题需要选择阅读范围时使用。不返回正文摘要。",
    promptSnippet: "kb_document_outline：查看指定文档的章节或片段目录。",
    promptGuidelines: [
      "用户询问文档结构、目录、某章在哪，或问题范围很宽需要先定位时，调用 kb_document_outline。",
      "目录只是导航，不是答案；拿到片段位置后，用 kb_read_around + document + chunkIndex 读取正文。",
      "目录是推断结果，可能不完整；不要向用户声称它是官方目录。若识别失败，改用 kb_search 或 kb_find_in_document。",
      "不要输出文档编号或内部 ID。",
    ],
    parameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal) => {
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

      if (snapshot.chunks.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `《${escapeKbText(source.document.title)}》当前没有可读片段，文档可能仍在解析或解析失败。`,
            },
          ],
          details: { summary: "文档没有可读片段", citations: [] } satisfies KbToolDetails,
        };
      }

      const maxSections = params.maxSections ?? 30;
      const { sections, inferred } = extractOutline(snapshot.chunks, maxSections);
      const lines = [
        `文档：《${escapeKbText(source.document.title)}》`,
        `片段数：${snapshot.total}${snapshot.truncated ? `（已分析前 ${snapshot.chunks.length} 个）` : ""}；解析方式：${escapeKbText(snapshot.chunkMethod ?? "未知")}`,
        inferred
          ? "没有识别到稳定的章节标题，以下按片段开头列出，仅作导航参考。"
          : "目录由片段标题推断，可能不完整。",
        "",
      ];

      for (const section of sections) {
        lines.push(
          `- ${escapeKbText(section.label)}（片段 ${section.chunkIndex + 1}，层级 ${section.level}）`,
        );
      }

      const text = `<kb_document_outline>\n${lines.join("\n")}\n</kb_document_outline>`;
      const summary = `《${source.document.title}》共 ${snapshot.total} 个片段，${inferred ? "未识别到章节标题" : `识别出 ${sections.length} 个章节`}`;

      return {
        content: [{ type: "text" as const, text }],
        details: { summary, citations: [] } satisfies KbToolDetails,
      };
    },
  });
}
