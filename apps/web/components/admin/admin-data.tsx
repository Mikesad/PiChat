"use client";

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
  type AuditAction,
  type AuditLogEntry,
  seedAuditLogs,
  seedKnowledgeBases,
} from "@/lib/admin-data";

export interface NewKnowledgeBaseInput {
  name: string;
  description: string;
  embeddingModel: string;
  ragflowDatasetId: string;
  defaultSubjects: AclSubject[];
}

export interface NewDocumentInput {
  title: string;
  sizeLabel: string;
}

interface AdminDataContextValue {
  knowledgeBases: AdminKnowledgeBase[];
  auditLogs: AuditLogEntry[];
  addKnowledgeBase: (input: NewKnowledgeBaseInput) => AdminKnowledgeBase;
  updateKnowledgeBase: (
    knowledgeBaseId: string,
    patch: Partial<Pick<AdminKnowledgeBase, "name" | "description" | "defaultSubjects">>,
  ) => void;
  deleteKnowledgeBase: (knowledgeBaseId: string) => void;
  addDocuments: (knowledgeBaseId: string, documents: NewDocumentInput[]) => void;
  updateDocument: (
    knowledgeBaseId: string,
    documentId: string,
    patch: Partial<AdminDocument>,
  ) => void;
  deleteDocuments: (knowledgeBaseId: string, documentIds: string[]) => void;
  retryDocument: (knowledgeBaseId: string, documentId: string) => void;
  setDocumentExceptions: (
    knowledgeBaseId: string,
    documentId: string,
    exceptions: AclException[],
  ) => void;
  setDefaultSubjects: (knowledgeBaseId: string, subjects: AclSubject[]) => void;
}

const AdminDataContext = createContext<AdminDataContextValue | null>(null);

function nowIso() {
  return new Date().toISOString();
}

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [knowledgeBases, setKnowledgeBases] = useState<AdminKnowledgeBase[]>(seedKnowledgeBases);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(seedAuditLogs);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const auditIdRef = useRef(0);
  const knowledgeBasesRef = useRef(knowledgeBases);
  knowledgeBasesRef.current = knowledgeBases;

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, []);

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(callback, delay);
    timersRef.current.push(timer);
  }, []);

  const logAudit = useCallback(
    (entry: {
      action: AuditAction;
      resourceType: AuditLogEntry["resourceType"];
      resourceId: string;
      resourceLabel: string;
      summary: string;
      metadata: Array<{ label: string; value: string }>;
      result?: AuditLogEntry["result"];
    }) => {
      auditIdRef.current += 1;
      const now = new Date();
      setAuditLogs((previous) => [
        {
          id: `audit-${Date.now()}-${auditIdRef.current}`,
          at: now.toISOString(),
          atLabel: "刚刚",
          actorId: "u-zhang",
          ...entry,
          result: entry.result ?? "success",
        },
        ...previous,
      ]);
    },
    [],
  );

  const addKnowledgeBase = useCallback(
    (input: NewKnowledgeBaseInput) => {
      const id = `kb-${Date.now()}`;
      const timestamp = nowIso();
      const knowledgeBase: AdminKnowledgeBase = {
        id,
        name: input.name.trim(),
        description: input.description.trim(),
        embeddingModel: input.embeddingModel,
        ragflowDatasetId: input.ragflowDatasetId.trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
        updatedLabel: "刚刚",
        defaultSubjects: input.defaultSubjects,
        documents: [],
      };
      setKnowledgeBases((previous) => [knowledgeBase, ...previous]);
      logAudit({
        action: "knowledge_base.create",
        resourceType: "knowledge_base",
        resourceId: id,
        resourceLabel: knowledgeBase.name,
        summary: "创建知识库",
        metadata: [
          { label: "Embedding", value: knowledgeBase.embeddingModel },
          {
            label: "默认范围",
            value:
              knowledgeBase.defaultSubjects.length > 0
                ? `${knowledgeBase.defaultSubjects.length} 个主体`
                : "未设置",
          },
        ],
      });
      return knowledgeBase;
    },
    [logAudit],
  );

  const updateKnowledgeBase = useCallback(
    (
      knowledgeBaseId: string,
      patch: Partial<Pick<AdminKnowledgeBase, "name" | "description" | "defaultSubjects">>,
    ) => {
      setKnowledgeBases((previous) =>
        previous.map((knowledgeBase) =>
          knowledgeBase.id === knowledgeBaseId
            ? {
                ...knowledgeBase,
                ...patch,
                updatedAt: nowIso(),
                updatedLabel: "刚刚",
              }
            : knowledgeBase,
        ),
      );
      const current = knowledgeBasesRef.current.find(
        (knowledgeBase) => knowledgeBase.id === knowledgeBaseId,
      );
      logAudit({
        action: "knowledge_base.update",
        resourceType: "knowledge_base",
        resourceId: knowledgeBaseId,
        resourceLabel: patch.name ?? current?.name ?? "知识库",
        summary: "更新知识库设置",
        metadata: [{ label: "字段", value: Object.keys(patch).join("、") || "设置" }],
      });
    },
    [logAudit],
  );

  const deleteKnowledgeBase = useCallback(
    (knowledgeBaseId: string) => {
      const current = knowledgeBasesRef.current.find(
        (knowledgeBase) => knowledgeBase.id === knowledgeBaseId,
      );
      setKnowledgeBases((previous) =>
        previous.filter((knowledgeBase) => knowledgeBase.id !== knowledgeBaseId),
      );
      logAudit({
        action: "knowledge_base.delete",
        resourceType: "knowledge_base",
        resourceId: knowledgeBaseId,
        resourceLabel: current?.name ?? "知识库",
        summary: "删除知识库及其文档与权限规则",
        metadata: [{ label: "文档", value: `${current?.documents.length ?? 0} 篇` }],
      });
    },
    [logAudit],
  );

  const addDocuments = useCallback(
    (knowledgeBaseId: string, documents: NewDocumentInput[]) => {
      const timestamp = nowIso();
      const created: AdminDocument[] = documents.map((document, index) => ({
        id: `doc-${Date.now()}-${index}`,
        knowledgeBaseId,
        title: document.title,
        status: "parsing",
        sizeLabel: document.sizeLabel,
        updatedAt: timestamp,
        updatedLabel: "刚刚",
        sourceKey: `s3://mock/${document.title}`,
        exceptions: [],
      }));

      setKnowledgeBases((previous) =>
        previous.map((knowledgeBase) =>
          knowledgeBase.id === knowledgeBaseId
            ? {
                ...knowledgeBase,
                documents: [...created, ...knowledgeBase.documents],
                updatedAt: timestamp,
                updatedLabel: "刚刚",
              }
            : knowledgeBase,
        ),
      );

      for (const document of created) {
        schedule(() => {
          setKnowledgeBases((previous) =>
            previous.map((knowledgeBase) =>
              knowledgeBase.id === knowledgeBaseId
                ? {
                    ...knowledgeBase,
                    documents: knowledgeBase.documents.map((item) =>
                      item.id === document.id ? { ...item, status: "ready" } : item,
                    ),
                  }
                : knowledgeBase,
            ),
          );
        }, 4500);
      }

      const knowledgeBaseName =
        knowledgeBasesRef.current.find((item) => item.id === knowledgeBaseId)?.name ?? "知识库";
      const firstDocument = created[0];
      logAudit({
        action: "document.upload",
        resourceType: "document",
        resourceId: firstDocument?.id ?? knowledgeBaseId,
        resourceLabel:
          created.length === 1 ? (firstDocument?.title ?? "文档") : `${created.length} 篇文档`,
        summary: `上传 ${created.length} 篇文档并加入解析队列`,
        metadata: [
          { label: "知识库", value: knowledgeBaseName },
          { label: "数量", value: `${created.length} 篇` },
        ],
      });
    },
    [schedule, logAudit],
  );

  const updateDocument = useCallback(
    (knowledgeBaseId: string, documentId: string, patch: Partial<AdminDocument>) => {
      setKnowledgeBases((previous) =>
        previous.map((knowledgeBase) =>
          knowledgeBase.id === knowledgeBaseId
            ? {
                ...knowledgeBase,
                documents: knowledgeBase.documents.map((document) =>
                  document.id === documentId
                    ? { ...document, ...patch, updatedAt: nowIso(), updatedLabel: "刚刚" }
                    : document,
                ),
              }
            : knowledgeBase,
        ),
      );
    },
    [],
  );

  const deleteDocuments = useCallback(
    (knowledgeBaseId: string, documentIds: string[]) => {
      const ids = new Set(documentIds);
      const knowledgeBaseName =
        knowledgeBasesRef.current.find((item) => item.id === knowledgeBaseId)?.name ?? "知识库";
      setKnowledgeBases((previous) =>
        previous.map((knowledgeBase) =>
          knowledgeBase.id === knowledgeBaseId
            ? {
                ...knowledgeBase,
                documents: knowledgeBase.documents.filter((document) => !ids.has(document.id)),
                updatedAt: nowIso(),
                updatedLabel: "刚刚",
              }
            : knowledgeBase,
        ),
      );
      logAudit({
        action: "document.delete",
        resourceType: "document",
        resourceId: documentIds[0] ?? knowledgeBaseId,
        resourceLabel: `${documentIds.length} 篇文档`,
        summary: `删除 ${documentIds.length} 篇文档`,
        metadata: [{ label: "知识库", value: knowledgeBaseName }],
      });
    },
    [logAudit],
  );

  const retryDocument = useCallback(
    (knowledgeBaseId: string, documentId: string) => {
      const knowledgeBase = knowledgeBasesRef.current.find((item) => item.id === knowledgeBaseId);
      const document = knowledgeBase?.documents.find((item) => item.id === documentId);
      updateDocument(knowledgeBaseId, documentId, { status: "parsing" });
      logAudit({
        action: "document.reparse",
        resourceType: "document",
        resourceId: documentId,
        resourceLabel: document?.title ?? "文档",
        summary: "重新加入解析队列",
        metadata: [{ label: "知识库", value: knowledgeBase?.name ?? "知识库" }],
      });
      schedule(() => {
        updateDocument(knowledgeBaseId, documentId, { status: "ready" });
      }, 3200);
    },
    [schedule, updateDocument, logAudit],
  );

  const setDocumentExceptions = useCallback(
    (knowledgeBaseId: string, documentId: string, exceptions: AclException[]) => {
      const knowledgeBase = knowledgeBasesRef.current.find((item) => item.id === knowledgeBaseId);
      const document = knowledgeBase?.documents.find((item) => item.id === documentId);
      const previous = document?.exceptions ?? [];
      const added = exceptions.filter(
        (exception) =>
          !previous.some((item) => item.type === exception.type && item.id === exception.id),
      ).length;
      const removed = previous.filter(
        (item) =>
          !exceptions.some((exception) => exception.type === item.type && exception.id === item.id),
      ).length;

      updateDocument(knowledgeBaseId, documentId, { exceptions });
      logAudit({
        action: "document.acl.update",
        resourceType: "document",
        resourceId: documentId,
        resourceLabel: document?.title ?? "文档",
        summary: `更新文档权限：新增 ${added} 条、移除 ${removed} 条`,
        metadata: [
          { label: "知识库", value: knowledgeBase?.name ?? "知识库" },
          { label: "例外", value: `${exceptions.length} 条` },
          {
            label: "拒绝",
            value: `${exceptions.filter((exception) => exception.permission === "deny").length} 条`,
          },
        ],
      });
    },
    [updateDocument, logAudit],
  );

  const setDefaultSubjects = useCallback(
    (knowledgeBaseId: string, subjects: AclSubject[]) => {
      const knowledgeBase = knowledgeBasesRef.current.find((item) => item.id === knowledgeBaseId);
      setKnowledgeBases((previous) =>
        previous.map((item) =>
          item.id === knowledgeBaseId
            ? {
                ...item,
                defaultSubjects: subjects,
                updatedAt: nowIso(),
                updatedLabel: "刚刚",
              }
            : item,
        ),
      );
      logAudit({
        action: "knowledge_base.default_access.update",
        resourceType: "knowledge_base",
        resourceId: knowledgeBaseId,
        resourceLabel: knowledgeBase?.name ?? "知识库",
        summary: `更新默认访问范围：${subjects.length} 个主体`,
        metadata: [
          { label: "主体", value: `${subjects.length} 个` },
          { label: "生效范围", value: "全部文档" },
        ],
      });
    },
    [logAudit],
  );

  return (
    <AdminDataContext.Provider
      value={{
        knowledgeBases,
        auditLogs,
        addKnowledgeBase,
        updateKnowledgeBase,
        deleteKnowledgeBase,
        addDocuments,
        updateDocument,
        deleteDocuments,
        retryDocument,
        setDocumentExceptions,
        setDefaultSubjects,
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
