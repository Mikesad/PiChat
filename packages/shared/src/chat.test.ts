import { describe, expect, it } from "vitest";
import { type ChatCitation, extractCitationIndices, resolveCitationUsage } from "./chat.js";

function citation(index: number, used?: boolean): ChatCitation {
  return {
    id: `c${index}`,
    index,
    documentId: `doc-${index}`,
    documentTitle: `文档 ${index}`,
    knowledgeBaseId: "kb-1",
    knowledgeBaseName: "内部制度",
    chunkId: `chunk-${index}`,
    snippet: "片段内容",
    ...(used === undefined ? {} : { used }),
  };
}

describe("citation usage", () => {
  it("extracts ASCII and full-width citation markers", () => {
    expect([...extractCitationIndices("根据 [1]，另见【2】和 [2]。")].sort()).toEqual([1, 2]);
  });

  it("ignores markers inside inline and fenced code", () => {
    const content = "示例 `[1]`\n\n```ts\nconst value = [2];\n```\n\n实际引用 [3]。";
    expect([...extractCitationIndices(content)]).toEqual([3]);
  });

  it("marks only citations referenced by the answer", () => {
    const resolved = resolveCitationUsage([citation(1), citation(2)], "答案依据 [2]。");
    expect(resolved.map(({ index, used }) => ({ index, used }))).toEqual([
      { index: 1, used: false },
      { index: 2, used: true },
    ]);
  });

  it("preserves an explicit usage flag", () => {
    const resolved = resolveCitationUsage([citation(1, false)], "答案依据 [1]。");
    expect(resolved[0]?.used).toBe(false);
  });
});
