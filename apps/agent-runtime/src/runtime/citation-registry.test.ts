import { describe, expect, it } from "vitest";
import { CitationRegistry } from "./citation-registry.js";

const draft = {
  documentId: "doc-1",
  documentTitle: "制度.pdf",
  knowledgeBaseId: "kb-1",
  knowledgeBaseName: "内部制度",
  chunkId: "chunk-1",
  snippet: "片段",
  ragflowDocumentId: "rf-doc-1",
};

describe("CitationRegistry", () => {
  it("assigns stable indexes and deduplicates chunks", () => {
    const registry = new CitationRegistry("msg-1");
    const first = registry.add(draft);
    const duplicate = registry.add(draft);
    const second = registry.add({ ...draft, chunkId: "chunk-2" });

    expect(first.isNew).toBe(true);
    expect(first.citation).toMatchObject({ id: "msg-1-c1", index: 1 });
    expect(duplicate.isNew).toBe(false);
    expect(duplicate.citation.index).toBe(1);
    expect(second.citation).toMatchObject({ id: "msg-1-c2", index: 2 });
    expect(registry.all()).toHaveLength(2);
  });

  it("resolves by citation index and removes a document", () => {
    const registry = new CitationRegistry("msg-1");
    registry.add(draft);
    const second = registry.add({ ...draft, documentId: "doc-2", chunkId: "chunk-2" });

    expect(registry.get(1)?.ragflowDocumentId).toBe("rf-doc-1");
    expect(registry.get(second.citation.index)?.citation.documentId).toBe("doc-2");

    registry.remove("doc-1");
    expect(registry.get(1)).toBeUndefined();
    expect(registry.all()).toHaveLength(1);
  });
});
