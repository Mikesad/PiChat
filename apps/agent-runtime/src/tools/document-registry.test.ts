import type { AccessScopeKnowledgeBase } from "@pichat/shared";
import { describe, expect, it } from "vitest";
import { DocumentRegistry } from "./document-registry.js";

const knowledgeBase: AccessScopeKnowledgeBase = {
  id: "kb-1",
  name: "内部制度",
  ragflowDatasetId: "ds-1",
  retrieval: { topK: 6, similarityThreshold: 0.2, vectorWeight: 0.3 },
  documents: [
    { id: "doc-1", title: "差旅制度.pdf", ragflowDocumentId: "rf-doc-1" },
    { id: "doc-2", title: "报销指引.docx", ragflowDocumentId: "rf-doc-2" },
  ],
};

describe("DocumentRegistry", () => {
  it("assigns stable run-scoped handles and deduplicates documents", () => {
    const [firstDocument, secondDocument] = knowledgeBase.documents;
    if (!firstDocument || !secondDocument) {
      throw new Error("test knowledge base must have two documents");
    }
    const registry = new DocumentRegistry();

    const first = registry.register(firstDocument, knowledgeBase);
    const duplicate = registry.register(firstDocument, knowledgeBase);
    const second = registry.register(secondDocument, knowledgeBase);

    expect(first.handle).toBe("D1");
    expect(duplicate.handle).toBe("D1");
    expect(second.handle).toBe("D2");
    expect(registry.get("d1")?.document.id).toBe("doc-1");
    expect(registry.all()).toHaveLength(2);
  });
});
