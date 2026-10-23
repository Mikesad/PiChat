import { describe, expect, it } from "vitest";
import { RunState } from "./run-state.js";

function createStateWithCitation() {
  const state = new RunState("run-1", "session-1", "assistant-1");
  state.citations.add({
    documentId: "doc-1",
    documentTitle: "差旅制度.pdf",
    knowledgeBaseId: "kb-1",
    knowledgeBaseName: "内部制度",
    chunkId: "chunk-1",
    snippet: "一线城市住宿标准为每人每晚 650 元。",
    ragflowDocumentId: "rf-doc-1",
  });
  return state;
}

describe("RunState citations", () => {
  it("marks a citation used when the answer references its index", () => {
    const state = createStateWithCitation();
    state.appendText("根据 [1]，一线城市住宿标准为每人每晚 650 元。");

    expect(state.snapshot().citations).toMatchObject([{ index: 1, used: true }]);
  });

  it("keeps citations unused when the answer has no citation markers", () => {
    const state = createStateWithCitation();
    state.appendText("在你有权访问的知识库中，没有找到与问题相关的依据。");

    expect(state.snapshot().citations).toMatchObject([{ index: 1, used: false }]);
  });
});
