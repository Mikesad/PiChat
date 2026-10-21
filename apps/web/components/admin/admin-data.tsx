"use client";

import type { DocumentSummary, KnowledgeBaseSummary } from "@pichat/shared";
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
  type AuditLogEntry,
  formatUpdatedLabel,
  seedAuditLogs,
} from "@/lib/admin-data";
import {
  ApiError,
  apiErrorMessage,
  fetchDocuments,
  fetchKnowledgeBases,
  reparseDocument as reparseDocumentRequest,
  updateDocumentAcl,
  updateKnowledgeBaseAcl,
} from "@/lib/api-client";
import { useAuth } from "../auth/auth-provider";

type AdminDataStatus = "loading" | "ready" | "error";

interface AdminDataContextValue {
  knowledgeBases: AdminKnowledgeBase[];
  auditLogs: AuditLogEntry[];
  status: AdminDataStatus;
  error: string | null;
  reload: () => Promise<void>;
  setDocumentExceptions: (
    knowledgeBaseId: string,
    documentId: string,
    exceptions: AclException[],
  ) => Promise<void>;
  setDefaultSubjects: (knowledgeBaseId: string, subjects: AclSubject[]) => Promise<void>;
  reparseDocument: (documentId: string) => Promise<void>;
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
        auditLogs: seedAuditLogs,
        status,
        error,
        reload,
        setDocumentExceptions,
        setDefaultSubjects,
        reparseDocument,
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
