import type { ChatCitation } from "@pichat/shared";

export interface CitationDraft {
  documentId: string;
  documentTitle: string;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  chunkId: string;
  snippet: string;
  ragflowDocumentId: string;
}

export interface CitationRef {
  citation: ChatCitation;
  ragflowDocumentId: string;
}

export interface CitationRegistration {
  citation: ChatCitation;
  isNew: boolean;
}

export class CitationRegistry {
  private readonly idPrefix: string;
  private readonly byKey = new Map<string, CitationRef>();
  private readonly byIndex = new Map<number, CitationRef>();
  private nextIndex = 1;

  constructor(idPrefix: string) {
    this.idPrefix = idPrefix;
  }

  add(draft: CitationDraft): CitationRegistration {
    const key = `${draft.documentId}:${draft.chunkId}`;
    const existing = this.byKey.get(key);
    if (existing) {
      return { citation: existing.citation, isNew: false };
    }

    const index = this.nextIndex;
    this.nextIndex += 1;

    const citation: ChatCitation = {
      id: `${this.idPrefix}-c${index}`,
      index,
      documentId: draft.documentId,
      documentTitle: draft.documentTitle,
      knowledgeBaseId: draft.knowledgeBaseId,
      knowledgeBaseName: draft.knowledgeBaseName,
      chunkId: draft.chunkId,
      snippet: draft.snippet,
    };

    const ref: CitationRef = {
      citation,
      ragflowDocumentId: draft.ragflowDocumentId,
    };
    this.byKey.set(key, ref);
    this.byIndex.set(index, ref);
    return { citation, isNew: true };
  }

  get(index: number): CitationRef | undefined {
    return this.byIndex.get(index);
  }

  find(documentId: string, chunkId: string): ChatCitation | undefined {
    return this.byKey.get(`${documentId}:${chunkId}`)?.citation;
  }

  all(): ChatCitation[] {
    return [...this.byIndex.values()]
      .sort((left, right) => left.citation.index - right.citation.index)
      .map((ref) => ref.citation);
  }

  refs(): CitationRef[] {
    return [...this.byIndex.values()].sort(
      (left, right) => left.citation.index - right.citation.index,
    );
  }

  remove(documentId: string): void {
    for (const [key, ref] of this.byKey) {
      if (ref.citation.documentId !== documentId) {
        continue;
      }
      this.byKey.delete(key);
      this.byIndex.delete(ref.citation.index);
    }
  }
}
