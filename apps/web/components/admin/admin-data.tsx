"use client";

import type {
  BatchUpdateDocumentAclResponse,
  CreateKnowledgeBaseRequest,
  DocumentSummary,
  KnowledgeBaseSummary,
  UpdateKnowledgeBaseRequest,
} from "@pichat/shared";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type AclException,
  type AclSubject,
  type AdminDocument,
  type AdminKnowledgeBase,
  formatUpdatedLabel,
} from "@/lib/admin-data";
import {
  ApiError,
  apiErrorMessage,
  createKnowledgeBase as createKnowledgeBaseRequest,
  deleteDocument as deleteDocumentRequest,
  deleteKnowledgeBase as deleteKnowledgeBaseRequest,
  fetchDocuments,
  fetchKnowledgeBases,
  reparseDocument as reparseDocumentRequest,
  updateDocumentAcl,
  updateDocumentsAcl,
  updateKnowledgeBaseAcl,
  updateKnowledgeBase as updateKnowledgeBaseRequest,
} from "@/lib/api-client";
import { useAuth } from "../auth/auth-provider";

type AdminDataStatus = "loading" | "ready" | "error";

interface AdminDataContextValue {
  knowledgeBases: AdminKnowledgeBase[];
  status: AdminDataStatus;
  error: string | null;
  reload: () => Promise<void>;
  setDocumentExceptions: (
    knowledgeBaseId: string,
    documentId: string,
    exceptions: AclException[],
  ) => Promise<void>;
  setDefaultSubjects: (knowledgeBaseId: string, subjects: AclSubject[]) => Promise<void>;
  setBatchDocumentExceptions: (
    knowledgeBaseId: string,
    documentIds: string[],
    exceptions: AclException[],
  ) => Promise<BatchUpdateDocumentAclResponse>;
  createKnowledgeBase: (input: CreateKnowledgeBaseRequest) => Promise<KnowledgeBaseSummary>;
  deleteKnowledgeBase: (knowledgeBaseId: string) => Promise<void>;
  deleteDocument: (documentId: string) => Promise<void>;
  deleteDocuments: (
    documentIds: string[],
  ) => Promise<{ deleted: number; failed: Array<{ documentId: string; message: string }> }>;
  reparseDocument: (documentId: string) => Promise<void>;
  updateKnowledgeBase: (
    knowledgeBaseId: string,
    input: UpdateKnowledgeBaseRequest,
  ) => Promise<void>;
}

const AdminDataContext = createContext<AdminDataContextValue | null>(null);

function mapDocument(document: DocumentSummary): AdminDocument {
  return {
    id: document.id,
    knowledgeBaseId: document.knowledgeBaseId,
    title: document.title,
    status: document.status,
    sizeLabel: document.sizeLabel,
    updatedAt: document.updatedAt,
    updatedLabel: formatUpdatedLabel(document.updatedAt),
    createdAt: document.createdAt,
    sourceKey: document.sourceKey,
    ragflowDocumentId: document.ragflowDocumentId,
    mimeType: document.mimeType,
    errorMessage: document.errorMessage,
    exceptions: document.exceptions,
    effectiveReaderCount: document.effectiveReaderCount,
    canManageAcl: document.canManageAcl,
  };
}

function mapKnowledgeBase(
  knowledgeBase: KnowledgeBaseSummary,
  documents: DocumentSummary[],
): AdminKnowledgeBase {
  return {
    id: knowledgeBase.id,
    name: knowledgeBase.name,
    description: knowledgeBase.description ?? "",
    embeddingModel: knowledgeBase.embeddingModel,
    ragflowDatasetId: knowledgeBase.ragflowDatasetId,
    retrievalTopK: knowledgeBase.retrievalTopK,
    retrievalSimilarityThreshold: knowledgeBase.retrievalSimilarityThreshold,
    retrievalVectorWeight: knowledgeBase.retrievalVectorWeight,
    aclVersion: knowledgeBase.aclVersion,
    createdAt: knowledgeBase.createdAt,
    updatedAt: knowledgeBase.updatedAt,
    updatedLabel: formatUpdatedLabel(knowledgeBase.updatedAt),
    defaultSubjects: knowledgeBase.defaultSubjects,
    documentCount: knowledgeBase.documentCount,
    readableDocumentCount: knowledgeBase.readableDocumentCount,
    canManageAcl: knowledgeBase.canManageAcl,
    documents: documents
      .map(mapDocument)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
}

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const [knowledgeBases, setKnowledgeBases] = useState<AdminKnowledgeBase[]>([]);
  const [status, setStatus] = useState<AdminDataStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus((current) => (current === "ready" ? "ready" : "loading"));
    setError(null);

    try {
      const response = await fetchKnowledgeBases();
      const documentResponses = await Promise.all(
        response.knowledgeBases.map((knowledgeBase) => fetchDocuments(knowledgeBase.id)),
      );

      if (requestId !== requestIdRef.current) {
        return;
      }

      setKnowledgeBases(
        response.knowledgeBases.map((knowledgeBase, index) =>
          mapKnowledgeBase(knowledgeBase, documentResponses[index]?.documents ?? []),
        ),
      );
      setStatus("ready");
    } catch (cause) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      if (cause instanceof ApiError && cause.status === 401) {
        void logout();
      }
      setError(apiErrorMessage(cause));
      setStatus("error");
    }
  }, [logout]);

  useEffect(() => {
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  useEffect(() => {
    const hasUnfinishedDocument = knowledgeBases.some((knowledgeBase) =>
      knowledgeBase.documents.some(
        (document) => document.status === "pending" || document.status === "parsing",
      ),
    );
    if (!hasUnfinishedDocument) {
      return;
    }

    const timer = window.setTimeout(() => {
      void reload();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [knowledgeBases, reload]);

  const setDocumentExceptions = useCallback(
    async (_knowledgeBaseId: string, documentId: string, exceptions: AclException[]) => {
      try {
        await updateDocumentAcl(documentId, { exceptions });
        await reload();
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          await logout();
        }
        throw cause;
      }
    },
    [reload, logout],
  );

  const setDefaultSubjects = useCallback(
    async (knowledgeBaseId: string, subjects: AclSubject[]) => {
      try {
        await updateKnowledgeBaseAcl(knowledgeBaseId, { defaultSubjects: subjects });
        await reload();
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          await logout();
        }
        throw cause;
      }
    },
    [reload, logout],
  );

  const setBatchDocumentExceptions = useCallback(
    async (knowledgeBaseId: string, documentIds: string[], exceptions: AclException[]) => {
      try {
        const response = await updateDocumentsAcl(knowledgeBaseId, {
          documentIds,
          exceptions,
          mode: "replace",
        });
        await reload();
        return response;
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          await logout();
        }
        throw cause;
      }
    },
    [reload, logout],
  );

  const createKnowledgeBase = useCallback(
    async (input: CreateKnowledgeBaseRequest) => {
      try {
        const response = await createKnowledgeBaseRequest(input);
        await reload();
        return response.knowledgeBase;
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          await logout();
        }
        throw cause;
      }
    },
    [reload, logout],
  );

  const updateKnowledgeBase = useCallback(
    async (knowledgeBaseId: string, input: UpdateKnowledgeBaseRequest) => {
      try {
        await updateKnowledgeBaseRequest(knowledgeBaseId, input);
        await reload();
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          await logout();
        }
        throw cause;
      }
    },
    [reload, logout],
  );

  const deleteKnowledgeBase = useCallback(
    async (knowledgeBaseId: string) => {
      try {
        await deleteKnowledgeBaseRequest(knowledgeBaseId);
        await reload();
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          await logout();
        }
        throw cause;
      }
    },
    [reload, logout],
  );

  const deleteDocument = useCallback(
    async (documentId: string) => {
      try {
        await deleteDocumentRequest(documentId);
        await reload();
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          await logout();
        }
        throw cause;
      }
    },
    [reload, logout],
  );

  const deleteDocuments = useCallback(
    async (documentIds: string[]) => {
      let deleted = 0;
      const failed: Array<{ documentId: string; message: string }> = [];
      for (const documentId of documentIds) {
        try {
          await deleteDocumentRequest(documentId);
          deleted += 1;
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) {
            await logout();
          }
          failed.push({ documentId, message: apiErrorMessage(cause) });
        }
      }
      await reload();
      return { deleted, failed };
    },
    [reload, logout],
  );

  const reparseDocument = useCallback(
    async (documentId: string) => {
      try {
        await reparseDocumentRequest(documentId);
        await reload();
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          await logout();
        }
        throw cause;
      }
    },
    [reload, logout],
  );

  return (
    <AdminDataContext.Provider
      value={{
        knowledgeBases,
        status,
        error,
        reload,
        setDocumentExceptions,
        setDefaultSubjects,
        setBatchDocumentExceptions,
        createKnowledgeBase,
        deleteKnowledgeBase,
        deleteDocument,
        deleteDocuments,
        reparseDocument,
        updateKnowledgeBase,
      }}
    >
      {children}
    </AdminDataContext.Provider>
  );
}

export function useAdminData() {
  const value = useContext(AdminDataContext);
  if (!value) {
    throw new Error("useAdminData must be used within AdminDataProvider");
  }
  return value;
}
