import type { AccessScopeDocument, AccessScopeKnowledgeBase } from "@pichat/shared";

export interface ScopedDocument {
  handle: string;
  document: AccessScopeDocument;
  knowledgeBase: AccessScopeKnowledgeBase;
}

export class DocumentRegistry {
  private readonly byHandle = new Map<string, ScopedDocument>();
  private readonly byDocumentId = new Map<string, ScopedDocument>();
  private nextIndex = 1;

  register(document: AccessScopeDocument, knowledgeBase: AccessScopeKnowledgeBase): ScopedDocument {
    const existing = this.byDocumentId.get(document.id);
    if (existing) {
      return existing;
    }

    const entry: ScopedDocument = {
      handle: `D${this.nextIndex}`,
      document,
      knowledgeBase,
    };
    this.nextIndex += 1;
    this.byHandle.set(entry.handle, entry);
    this.byDocumentId.set(document.id, entry);
    return entry;
  }

  get(handle: string): ScopedDocument | undefined {
    return this.byHandle.get(handle.trim().toUpperCase());
  }

  all(): ScopedDocument[] {
    return [...this.byHandle.values()];
  }
}
