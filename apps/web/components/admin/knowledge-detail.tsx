"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  type AclException,
  type AclPermission,
  type AclSubject,
  type AdminDocument,
  type AdminKnowledgeBase,
  documentStats,
  findKnowledgeBase,
  subjectKey,
} from "@/lib/admin-data";
import { cn } from "@/lib/utils";
import { DocumentPreviewDialog } from "../document-preview-dialog";
import { Icon, Spinner } from "../icons";
import { IconButton } from "../ui";
import { BulkAclDrawer, DocumentAclDrawer, PermissionSelect, SubjectSelect } from "./acl";
import { useAdminData } from "./admin-data";
import { ConfirmDialog } from "./confirm-dialog";
import { useDirectory } from "./directory";
import { Tabs } from "./tabs";
import { useToast } from "./toast";
import {
  Badge,
  Button,
  EmptyState,
  FilterChip,
  FormField,
  InfoBanner,
  inputClass,
  LinkButton,
  PageHeader,
  SearchInput,
  SelectAllCheckbox,
  StatStrip,
  StatusBadge,
  selectClass,
  TableShell,
  tdClass,
  textareaClass,
  thClass,
  trClass,
} from "./ui";
import { UploadDrawer } from "./upload-drawer";
import { useApiErrorHandler } from "./use-api-error";

type TabId = "documents" | "access" | "settings";
type StatusFilter = "all" | "pending" | "ready" | "parsing" | "failed" | "exceptions";

const filters: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "pending", label: "排队中" },
  { id: "ready", label: "可检索" },
  { id: "parsing", label: "解析中" },
  { id: "failed", label: "解析失败" },
  { id: "exceptions", label: "有文档级权限" },
];

function reparseLabel(status: AdminDocument["status"]) {
  if (status === "pending") {
    return "开始解析";
  }
  if (status === "failed") {
    return "重试解析";
  }
  return "重新解析";
}

export function KnowledgeDetailPage({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const { knowledgeBases, status, error, reload, reparseDocument } = useAdminData();
  const { showToast } = useToast();
  const handleApiError = useApiErrorHandler();
  const router = useRouter();
  const knowledgeBase = findKnowledgeBase(knowledgeBases, knowledgeBaseId);
  const [tab, setTab] = useState<TabId>("documents");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [aclDocumentId, setAclDocumentId] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<AdminDocument | null>(null);

  function handlePreview(document: AdminDocument) {
    if (!document.canRead) {
      showToast("没有阅读权限，请联系管理员申请");
      return;
    }
    setPreviewDocument(document);
  }

  async function handleReparse(documentId: string) {
    const document = knowledgeBase?.documents.find((item) => item.id === documentId);
    try {
      await reparseDocument(documentId);
      if (document?.status === "pending") {
        showToast("已加入解析队列");
      } else if (document?.status === "failed") {
        showToast("已重新加入解析队列");
      } else {
        showToast("已提交重新解析");
      }
    } catch (cause) {
      await handleApiError(cause);
    }
  }

  if (!knowledgeBase && status === "loading") {
    return (
      <div className="space-y-6">
        <PageHeader
          backHref="/knowledge"
          backLabel="返回知识库"
          title="正在加载知识库"
          description="正在从服务端获取文档与权限信息。"
        />
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <Spinner className="text-accent" />
          <p className="text-sm text-muted">加载中…</p>
        </div>
      </div>
    );
  }

  if (!knowledgeBase && status === "error") {
    return (
      <div className="space-y-6">
        <PageHeader
          backHref="/knowledge"
          backLabel="返回知识库"
          title="知识库加载失败"
          description={error ?? "请稍后重试。"}
          actions={
            <Button variant="secondary" onClick={() => void reload()}>
              重试
            </Button>
          }
        />
      </div>
    );
  }

  if (!knowledgeBase) {
    return (
      <div className="space-y-6">
        <PageHeader
          backHref="/knowledge"
          backLabel="返回知识库"
          eyebrow="Knowledge"
          title="知识库不存在"
          description="它可能已被删除、当前账号无权访问，或者链接已经失效。"
          actions={<LinkButton href="/knowledge">返回知识库列表</LinkButton>}
        />
      </div>
    );
  }

  const stats = documentStats(knowledgeBase);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/knowledge"
        backLabel="返回知识库"
        title={knowledgeBase.name}
        description={knowledgeBase.description}
        actions={
          knowledgeBase.canManageAcl ? (
            <Button onClick={() => setUploadOpen(true)}>
              <Icon name="upload" size={14} />
              上传文档
            </Button>
          ) : null
        }
      />

      {status === "error" ? (
        <InfoBanner
          tone="danger"
          icon="alert-circle"
          title="刷新失败，当前显示上次加载的数据"
          action={
            <Button size="sm" variant="secondary" onClick={() => void reload()}>
              重试
            </Button>
          }
        >
          {error ?? "请稍后重试。"}
        </InfoBanner>
      ) : null}

      <StatStrip
        items={[
          { label: "文档总数", value: stats.total, hint: "不含已删除" },
          { label: "可检索", value: stats.ready, hint: "解析完成" },
          {
            label: "待解析",
            value: stats.pending + stats.parsing,
            hint: "排队中或解析中",
            tone: stats.pending + stats.parsing > 0 ? "warning" : "default",
          },
          {
            label: "解析失败",
            value: stats.failed,
            hint: "需要处理",
            tone: stats.failed > 0 ? "danger" : "default",
          },
        ]}
      />

      <Tabs
        items={[
          { id: "documents", label: "文档", count: stats.total },
          {
            id: "access",
            label: "访问范围",
            count: knowledgeBase.defaultSubjects.length + knowledgeBase.deniedSubjects.length,
          },
          { id: "settings", label: "设置" },
        ]}
        value={tab}
        onChange={setTab}
        label="知识库视图"
      />

      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="outline-none"
      >
        {tab === "documents" ? (
          <DocumentsTab
            knowledgeBase={knowledgeBase}
            onOpenAcl={setAclDocumentId}
            onUpload={() => setUploadOpen(true)}
            onRetry={handleReparse}
            onPreview={handlePreview}
          />
        ) : null}
        {tab === "access" ? (
          <AccessTab knowledgeBase={knowledgeBase} onOpenAcl={setAclDocumentId} />
        ) : null}
        {tab === "settings" ? (
          <SettingsTab knowledgeBase={knowledgeBase} onDeleted={() => router.push("/knowledge")} />
        ) : null}
      </div>

      {uploadOpen ? (
        <UploadDrawer knowledgeBase={knowledgeBase} onClose={() => setUploadOpen(false)} />
      ) : null}
      {aclDocumentId ? (
        <DocumentAclDrawer
          key={aclDocumentId}
          documentId={aclDocumentId}
          onClose={() => setAclDocumentId(null)}
        />
      ) : null}
      {previewDocument ? (
        <DocumentPreviewDialog
          key={previewDocument.id}
          documentId={previewDocument.id}
          title={previewDocument.title}
          sizeLabel={previewDocument.sizeLabel}
          onClose={() => setPreviewDocument(null)}
        />
      ) : null}
    </div>
  );
}

function DocumentsTab({
  knowledgeBase,
  onOpenAcl,
  onUpload,
  onRetry,
  onPreview,
}: {
  knowledgeBase: AdminKnowledgeBase;
  onOpenAcl: (documentId: string) => void;
  onUpload: () => void;
  onRetry: (documentId: string) => Promise<void>;
  onPreview: (document: AdminDocument) => void;
}) {
  const { deleteDocument, deleteDocuments } = useAdminData();
  const { showToast } = useToast();
  const handleApiError = useApiErrorHandler();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<AdminDocument | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkAclOpen, setBulkAclOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reparsingIds, setReparsingIds] = useState<string[]>([]);
  const [reparseTarget, setReparseTarget] = useState<AdminDocument | null>(null);

  const normalized = query.trim().toLowerCase();
  const rows = knowledgeBase.documents.filter((document) => {
    if (normalized && !document.title.toLowerCase().includes(normalized)) {
      return false;
    }
    if (statusFilter === "exceptions") {
      return document.exceptions.length > 0;
    }
    return statusFilter === "all" || document.status === statusFilter;
  });
  const visibleIds = rows.map((document) => document.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.includes(id));

  function handleQuery(value: string) {
    setQuery(value);
    setSelectedIds([]);
  }

  function handleFilter(value: StatusFilter) {
    setStatusFilter(value);
    setSelectedIds([]);
  }

  function toggleOne(documentId: string, checked: boolean) {
    setSelectedIds((previous) =>
      checked
        ? [...new Set([...previous, documentId])]
        : previous.filter((id) => id !== documentId),
    );
  }

  function toggleAll(checked: boolean) {
    setSelectedIds((previous) =>
      checked
        ? [...new Set([...previous, ...visibleIds])]
        : previous.filter((id) => !visibleIds.includes(id)),
    );
  }

  async function runReparse(documentId: string) {
    setReparsingIds((previous) =>
      previous.includes(documentId) ? previous : [...previous, documentId],
    );
    try {
      await onRetry(documentId);
    } finally {
      setReparsingIds((previous) => previous.filter((id) => id !== documentId));
    }
  }

  function requestReparse(document: AdminDocument) {
    if (document.status === "ready" || document.status === "parsing") {
      setReparseTarget(document);
      return;
    }
    void runReparse(document.id);
  }

  async function handleDeleteDocument() {
    if (!deleteTarget || deleting) {
      return;
    }
    setDeleting(true);
    try {
      await deleteDocument(deleteTarget.id);
      setSelectedIds((previous) => previous.filter((id) => id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast("文档已删除");
    } catch (cause) {
      await handleApiError(cause);
    } finally {
      setDeleting(false);
    }
  }

  async function handleBulkDelete() {
    if (deleting) {
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteDocuments(selectedIds);
      if (result.failed.length > 0) {
        showToast(
          `已删除 ${result.deleted} 篇，${result.failed.length} 篇失败：${result.failed[0]?.message ?? ""}`,
          "danger",
        );
      } else {
        showToast(`已删除 ${result.deleted} 篇文档`);
      }
      setSelectedIds([]);
      setBulkDeleteOpen(false);
    } catch (cause) {
      await handleApiError(cause);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={handleQuery} placeholder="搜索文档" label="搜索文档" />
        <div className="flex flex-wrap gap-1.5">
          {filters.map((filter) => (
            <FilterChip
              key={filter.id}
              active={statusFilter === filter.id}
              onClick={() => handleFilter(filter.id)}
            >
              {filter.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          {knowledgeBase.documents.length === 0 ? (
            <EmptyState
              icon="upload"
              title="还没有文档"
              description={
                knowledgeBase.canManageAcl
                  ? "上传 PDF、DOCX、MD 或 TXT 后，由后台解析并自动进入检索范围。"
                  : "当前账号为只读，暂无可查看的文档。"
              }
              action={
                knowledgeBase.canManageAcl ? (
                  <Button onClick={onUpload}>
                    <Icon name="upload" size={15} />
                    上传文档
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <EmptyState
              icon="search"
              title="没有匹配的文档"
              description="调整关键词或筛选条件后再试。"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("all");
                  }}
                >
                  清除筛选
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <>
          <div className="hidden xl:block">
            <TableShell
              minWidth={720}
              footer={
                <>
                  <span>
                    共 {knowledgeBase.documents.length} 篇 · 当前显示 {rows.length} 篇
                  </span>
                  <span>
                    {selectedIds.length > 0 ? `已选 ${selectedIds.length} 篇` : "可批量设置权限"}
                  </span>
                </>
              }
            >
              <thead>
                <tr>
                  <th className={`${thClass} w-10`}>
                    <SelectAllCheckbox
                      checked={allVisibleSelected}
                      indeterminate={someVisibleSelected && !allVisibleSelected}
                      onChange={toggleAll}
                      label="选择当前列表中的全部文档"
                    />
                  </th>
                  <th className={thClass}>文档</th>
                  <th className={thClass}>状态</th>
                  <th className={thClass}>可见范围</th>
                  <th className={thClass}>文档级权限</th>
                  <th className={`${thClass} hidden xl:table-cell`}>更新</th>
                  <th className={thClass}>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((document) => (
                  <DocumentRow
                    key={document.id}
                    knowledgeBase={knowledgeBase}
                    document={document}
                    selected={selectedIds.includes(document.id)}
                    onToggle={(checked) => toggleOne(document.id, checked)}
                    onOpenAcl={() => onOpenAcl(document.id)}
                    onRetry={() => requestReparse(document)}
                    retrying={reparsingIds.includes(document.id)}
                    onPreview={() => onPreview(document)}
                    onDelete={() => setDeleteTarget(document)}
                  />
                ))}
              </tbody>
            </TableShell>
          </div>

          <ul className="space-y-2 xl:hidden">
            <li className="flex items-center justify-between px-1">
              <div className="inline-flex items-center gap-2 text-xs text-muted">
                <SelectAllCheckbox
                  checked={allVisibleSelected}
                  indeterminate={someVisibleSelected && !allVisibleSelected}
                  onChange={toggleAll}
                  label="全选当前结果"
                />
                <span>全选当前结果</span>
              </div>
              <span className="text-[11px] text-subtle">
                {selectedIds.length > 0 ? `已选 ${selectedIds.length} 篇` : ""}
              </span>
            </li>
            {rows.map((document) => (
              <MobileDocumentCard
                key={document.id}
                knowledgeBase={knowledgeBase}
                document={document}
                selected={selectedIds.includes(document.id)}
                onToggle={(checked) => toggleOne(document.id, checked)}
                onOpenAcl={() => onOpenAcl(document.id)}
                onRetry={() => requestReparse(document)}
                retrying={reparsingIds.includes(document.id)}
                onPreview={() => onPreview(document)}
                onDelete={() => setDeleteTarget(document)}
              />
            ))}
          </ul>
        </>
      )}

      {knowledgeBase.canManageAcl && selectedIds.length > 0 ? (
        <div className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-pop sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
          <p className="mr-auto text-xs font-medium text-fg">已选 {selectedIds.length} 篇</p>
          <Button size="sm" variant="secondary" onClick={() => setBulkAclOpen(true)}>
            <Icon name="shield-check" size={13} />
            批量授权
          </Button>
          <Button size="sm" variant="danger" onClick={() => setBulkDeleteOpen(true)}>
            <Icon name="trash" size={13} />
            删除
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
            清除
          </Button>
        </div>
      ) : null}

      {knowledgeBase.canManageAcl && selectedIds.length > 0 ? (
        <div aria-hidden="true" className="h-16 sm:h-20" />
      ) : null}

      {bulkAclOpen ? (
        <BulkAclDrawer
          knowledgeBaseId={knowledgeBase.id}
          documentIds={selectedIds}
          onClose={() => setBulkAclOpen(false)}
          onApplied={() => setSelectedIds([])}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteDocument()}
        title="删除文档？"
        description={`将删除「${deleteTarget?.title ?? ""}」及其全部文档级权限，并从检索范围中移除。RAGFlow 与本地文件会尽力清理，失败会记录审计。`}
        confirmLabel={deleting ? "删除中…" : "删除文档"}
        tone="danger"
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={() => void handleBulkDelete()}
        title={`删除选中的 ${selectedIds.length} 篇文档？`}
        description="将软删除这些文档及其全部文档级权限，并从检索范围中移除。RAGFlow 与本地文件会尽力清理，失败会记录审计。"
        confirmLabel={deleting ? "删除中…" : "删除文档"}
        tone="danger"
      />

      {reparseTarget ? (
        <ConfirmDialog
          open
          onClose={() => setReparseTarget(null)}
          onConfirm={() => {
            const target = reparseTarget;
            setReparseTarget(null);
            void runReparse(target.id);
          }}
          title={reparseTarget.status === "ready" ? "重新解析这篇文档？" : "重新启动解析？"}
          description="将重新调用 RAGFlow 解析并重建该文档的向量索引，解析期间文档会暂时不可检索。"
          confirmLabel="重新解析"
        />
      ) : null}
    </div>
  );
}

function DocumentRow({
  knowledgeBase,
  document,
  selected,
  onToggle,
  onOpenAcl,
  onRetry,
  retrying,
  onPreview,
  onDelete,
}: {
  knowledgeBase: AdminKnowledgeBase;
  document: AdminDocument;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onOpenAcl: () => void;
  onRetry: () => void;
  retrying: boolean;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const exceptionCount = document.exceptions.length;
  const denyCount = document.exceptions.filter(
    (exception) => exception.permission === "deny",
  ).length;
  const canManage = knowledgeBase.canManageAcl && document.canManageAcl;

  return (
    <tr className={cn(trClass, selected && "bg-accent-soft/40")}>
      <td className={tdClass}>
        {canManage ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onToggle(event.target.checked)}
            aria-label={`选择 ${document.title}`}
            className="size-4 cursor-pointer rounded border-border accent-accent"
          />
        ) : null}
      </td>
      <td className={tdClass}>
        {document.canRead ? (
          <button
            type="button"
            onClick={onPreview}
            className="block max-w-[300px] cursor-pointer truncate text-left text-sm font-medium text-fg transition-colors hover:text-accent-text"
            title={`预览 ${document.title}`}
          >
            {document.title}
          </button>
        ) : (
          <div className="flex max-w-[300px] items-center gap-1.5">
            <span className="truncate text-sm font-medium text-fg">{document.title}</span>
            <Badge tone="warning" className="shrink-0">
              <Icon name="lock" size={10} />
              无权限
            </Badge>
          </div>
        )}
        <p className="mt-0.5 text-[11px] text-subtle">
          {document.canRead
            ? `${document.sizeLabel ?? "—"} · ${document.updatedLabel}`
            : "联系管理员申请阅读权限"}
        </p>
        {document.status === "failed" && document.errorMessage ? (
          <p
            className="mt-0.5 max-w-[300px] truncate text-[11px] text-danger"
            title={document.errorMessage}
          >
            {document.errorMessage}
          </p>
        ) : null}
      </td>
      <td className={tdClass}>
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge status={document.status} />
          {document.aclMode === "restricted" ? <Badge tone="accent">独立授权</Badge> : null}
        </div>
      </td>
      <td className={tdClass}>
        {document.effectiveReaderCount === 0 ? (
          <Badge tone="warning">无人可访问</Badge>
        ) : (
          <>
            <p className="text-sm tabular-nums text-fg">{document.effectiveReaderCount} 人可读</p>
            <p className="mt-0.5 text-[11px] text-subtle">服务端有效人数</p>
          </>
        )}
      </td>
      <td className={tdClass}>
        {exceptionCount === 0 ? (
          <span className="text-xs text-subtle">—</span>
        ) : (
          <>
            <p className="text-sm tabular-nums text-fg">{exceptionCount} 条</p>
            {denyCount > 0 ? (
              <p className="mt-0.5 text-[11px] text-danger">{denyCount} 条拒绝</p>
            ) : null}
          </>
        )}
      </td>
      <td className={`${tdClass} hidden xl:table-cell`}>
        <p className="text-xs text-muted">{document.updatedLabel}</p>
      </td>
      <td className={`${tdClass} text-right`}>
        <div className="flex items-center justify-end gap-0.5">
          {document.canRead ? (
            <IconButton label="预览文档" icon="eye" onClick={onPreview} />
          ) : (
            <IconButton label="没有阅读权限，请联系管理员申请" icon="lock" disabled />
          )}
          {canManage ? (
            <>
              <IconButton label="管理与权限" icon="lock" onClick={onOpenAcl} />
              <IconButton
                label={retrying ? "正在提交解析" : reparseLabel(document.status)}
                icon="refresh"
                onClick={onRetry}
                disabled={retrying}
                aria-busy={retrying}
              />
              <IconButton label="删除文档" icon="trash" onClick={onDelete} />
            </>
          ) : (
            <span className="px-1 text-xs text-subtle">只读</span>
          )}
        </div>
      </td>
    </tr>
  );
}

function MobileDocumentCard({
  knowledgeBase,
  document,
  selected,
  onToggle,
  onOpenAcl,
  onRetry,
  retrying,
  onPreview,
  onDelete,
}: {
  knowledgeBase: AdminKnowledgeBase;
  document: AdminDocument;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onOpenAcl: () => void;
  onRetry: () => void;
  retrying: boolean;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const exceptionCount = document.exceptions.length;
  const denyCount = document.exceptions.filter(
    (exception) => exception.permission === "deny",
  ).length;
  const canManage = knowledgeBase.canManageAcl && document.canManageAcl;

  return (
    <li className="rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-start gap-2.5">
        {canManage ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onToggle(event.target.checked)}
            aria-label={`选择 ${document.title}`}
            className="mt-1.5 size-4 shrink-0 cursor-pointer rounded border-border accent-accent"
          />
        ) : null}
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-subtle">
          <Icon name="file-text" size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {document.canRead ? (
              <button
                type="button"
                onClick={onPreview}
                className="block max-w-full cursor-pointer truncate text-left text-sm font-medium text-fg transition-colors hover:text-accent-text"
                title={`预览 ${document.title}`}
              >
                {document.title}
              </button>
            ) : (
              <span className="truncate text-sm font-medium text-fg">{document.title}</span>
            )}
            {document.canRead ? null : (
              <Badge tone="warning" className="shrink-0">
                <Icon name="lock" size={10} />
                无权限
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-subtle">
            {document.canRead
              ? `${document.sizeLabel ?? "—"} · ${document.updatedLabel}`
              : "联系管理员申请阅读权限"}
          </p>
          {document.status === "failed" && document.errorMessage ? (
            <p className="mt-0.5 text-[11px] text-danger">{document.errorMessage}</p>
          ) : null}
        </div>
        <StatusBadge status={document.status} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
        {document.aclMode === "restricted" ? <Badge tone="accent">独立授权</Badge> : null}
        {document.effectiveReaderCount === 0 ? (
          <Badge tone="warning">无人可访问</Badge>
        ) : (
          <span className="text-fg">{document.effectiveReaderCount} 人可读</span>
        )}
        <span>{exceptionCount} 条文档级权限</span>
        {denyCount > 0 ? <span className="text-danger">{denyCount} 条拒绝</span> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {document.canRead ? (
          <Button size="sm" variant="secondary" onClick={onPreview}>
            <Icon name="eye" size={13} />
            预览
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled>
            <Icon name="lock" size={13} />
            无权限
          </Button>
        )}
        {canManage ? (
          <>
            <Button size="sm" variant="secondary" onClick={onOpenAcl}>
              <Icon name="lock" size={13} />
              管理权限
            </Button>
            <Button size="sm" variant="secondary" onClick={onRetry} disabled={retrying}>
              <Icon name="refresh" size={13} />
              {retrying ? "提交中…" : reparseLabel(document.status)}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete}>
              <Icon name="trash" size={13} />
              删除
            </Button>
          </>
        ) : (
          <span className="text-[11px] text-subtle">当前角色只读</span>
        )}
      </div>
    </li>
  );
}

function AccessTab({
  knowledgeBase,
  onOpenAcl,
}: {
  knowledgeBase: AdminKnowledgeBase;
  onOpenAcl: (documentId: string) => void;
}) {
  const { setAccessSubjects } = useAdminData();
  const { subjectName, subjectMemberCount } = useDirectory();
  const { showToast } = useToast();
  const handleApiError = useApiErrorHandler();
  const [subjects, setSubjects] = useState<AclException[]>(() => [
    ...knowledgeBase.defaultSubjects.map((subject) => ({
      ...subject,
      permission: "read" as const,
    })),
    ...knowledgeBase.deniedSubjects.map((subject) => ({ ...subject, permission: "deny" as const })),
  ]);
  const [subjectValue, setSubjectValue] = useState("");
  const [permission, setPermission] = useState<AclPermission>("read");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSubjects([
      ...knowledgeBase.defaultSubjects.map((subject) => ({
        ...subject,
        permission: "read" as const,
      })),
      ...knowledgeBase.deniedSubjects.map((subject) => ({
        ...subject,
        permission: "deny" as const,
      })),
    ]);
  }, [knowledgeBase.defaultSubjects, knowledgeBase.deniedSubjects]);

  const originalSubjects = [
    ...knowledgeBase.defaultSubjects.map((subject) => ({
      ...subject,
      permission: "read" as const,
    })),
    ...knowledgeBase.deniedSubjects.map((subject) => ({ ...subject, permission: "deny" as const })),
  ];
  const dirty =
    subjects.length !== originalSubjects.length ||
    subjects.some(
      (subject) =>
        !originalSubjects.some(
          (item) =>
            subjectKey(item) === subjectKey(subject) && item.permission === subject.permission,
        ),
    );
  const allowCount = subjects.filter((subject) => subject.permission === "read").length;
  const denyCount = subjects.length - allowCount;
  const docsWithExceptions = knowledgeBase.documents.filter(
    (document) => document.exceptions.length > 0,
  );
  const noAccessDocuments = knowledgeBase.documents.filter(
    (document) => document.effectiveReaderCount === 0,
  );

  function parseSubject(value: string): AclSubject | null {
    const [type, id] = value.split(":");
    if ((type === "user" || type === "group") && id) {
      return { type, id };
    }
    return null;
  }

  function addSubject() {
    const subject = parseSubject(subjectValue);
    if (!subject) {
      setError("请选择用户或部门");
      return;
    }
    if (subjects.some((item) => subjectKey(item) === subjectKey(subject))) {
      setError("该主体已在访问范围中，请先移除再调整权限");
      return;
    }
    setSubjects((previous) => [...previous, { ...subject, permission }]);
    setSubjectValue("");
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await setAccessSubjects(knowledgeBase.id, subjects);
      showToast("知识库访问范围已更新，下一次提问生效");
      setConfirmOpen(false);
    } catch (cause) {
      await handleApiError(cause);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-fg">默认访问范围</h2>
            <p className="mt-0.5 text-[11px] text-subtle">
              {allowCount} 个允许 · {denyCount} 个禁止 · 保存后由服务端重新计算有效人数
            </p>
          </div>
          {knowledgeBase.canManageAcl ? (
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={!dirty || saving}>
              {saving ? "保存中…" : "保存默认范围"}
            </Button>
          ) : (
            <Badge tone="neutral">只读</Badge>
          )}
        </div>

        <div className="p-4">
          {knowledgeBase.canManageAcl ? (
            <>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_auto]">
                <SubjectSelect
                  value={subjectValue}
                  onChange={(value) => {
                    setSubjectValue(value);
                    setError(null);
                  }}
                  label="选择默认访问范围的用户或部门"
                />
                <PermissionSelect value={permission} onChange={setPermission} label="选择权限" />
                <Button variant="secondary" onClick={addSubject}>
                  <Icon name="plus" size={14} />
                  添加
                </Button>
              </div>
              {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
            </>
          ) : (
            <p className="text-xs text-subtle">当前角色只读，不能修改知识库默认访问范围。</p>
          )}

          {subjects.length === 0 ? (
            <div className="mt-3">
              <InfoBanner tone="warning" icon="lock" title="未设置默认范围">
                普通成员默认无法读取该知识库中的文档；可单独添加文档级读取权限，但知识库级禁止无法被覆盖。
              </InfoBanner>
            </div>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {subjects.map((subject) => (
                <li
                  key={subjectKey(subject)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2",
                    subject.permission === "deny"
                      ? "border-danger/30 bg-danger-soft/60"
                      : "border-border bg-surface",
                  )}
                >
                  <Icon
                    name={subject.type === "group" ? "users" : "user"}
                    size={14}
                    className={cn(
                      "shrink-0",
                      subject.permission === "deny" ? "text-danger" : "text-subtle",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {subjectName(subject)}
                  </span>
                  <span className="shrink-0 text-[11px] text-subtle">
                    {subjectMemberCount(subject)} 人
                  </span>
                  <Badge tone={subject.permission === "deny" ? "danger" : "success"}>
                    {subject.permission === "deny" ? "禁止" : "允许"}
                  </Badge>
                  {knowledgeBase.canManageAcl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSubjects((previous) =>
                          previous.filter((item) => subjectKey(item) !== subjectKey(subject)),
                        )
                      }
                      aria-label={`移除 ${subjectName(subject)}`}
                      className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-danger"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-fg">文档级权限</h2>
            <p className="mt-0.5 text-[11px] text-subtle">
              {docsWithExceptions.length} 篇文档有文档级权限
            </p>
          </div>
          <LinkButton href="/permissions" size="sm">
            查看全部文档权限
            <Icon name="chevron-right" size={13} />
          </LinkButton>
        </div>
        {docsWithExceptions.length === 0 ? (
          <p className="px-4 py-5 text-xs text-subtle">
            没有文档级权限。所有文档只应用知识库默认范围。
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {docsWithExceptions.map((document) => {
              const denyCount = document.exceptions.filter(
                (exception) => exception.permission === "deny",
              ).length;
              return (
                <li key={document.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">{document.title}</p>
                    <p className="mt-0.5 text-[11px] text-subtle">
                      {document.effectiveReaderCount} 人可读 · {document.exceptions.length}{" "}
                      条文档级权限
                      {denyCount > 0 ? ` · ${denyCount} 条拒绝` : ""}
                    </p>
                  </div>
                  <StatusBadge status={document.status} />
                  {document.canManageAcl ? (
                    <Button size="sm" variant="secondary" onClick={() => onOpenAcl(document.id)}>
                      调整
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {noAccessDocuments.length > 0 ? (
        <InfoBanner tone="warning" icon="alert-circle" title="有文档没有任何活跃用户可读">
          {noAccessDocuments.length}{" "}
          篇文档当前没有有效读者。请确认默认范围；若存在知识库级禁止，文档级读取权限无法覆盖。
        </InfoBanner>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSave}
        title="保存知识库访问范围？"
        description={`将影响 ${knowledgeBase.documents.length} 篇文档。禁止优先于允许，并覆盖文档级读取权限；保存后由服务端重新计算权限，并在下一次提问时生效。`}
        confirmLabel={subjects.length === 0 ? "保存并清空访问范围" : "保存访问范围"}
        tone={subjects.length === 0 ? "danger" : "primary"}
      />
    </div>
  );
}

function SettingsTab({
  knowledgeBase,
  onDeleted,
}: {
  knowledgeBase: AdminKnowledgeBase;
  onDeleted: () => void;
}) {
  const { deleteKnowledgeBase, updateKnowledgeBase } = useAdminData();
  const { groups, members } = useDirectory();
  const { showToast } = useToast();
  const handleApiError = useApiErrorHandler();
  const [name, setName] = useState(knowledgeBase.name);
  const [description, setDescription] = useState(knowledgeBase.description);
  const [ownerDepartmentId, setOwnerDepartmentId] = useState(knowledgeBase.ownerDepartmentId ?? "");
  const [retrievalTopK, setRetrievalTopK] = useState(knowledgeBase.retrievalTopK);
  const [retrievalSimilarityThreshold, setRetrievalSimilarityThreshold] = useState(
    knowledgeBase.retrievalSimilarityThreshold,
  );
  const [retrievalVectorWeight, setRetrievalVectorWeight] = useState(
    knowledgeBase.retrievalVectorWeight,
  );
  const [error, setError] = useState<{ field: "name" | "retrieval"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canEdit = knowledgeBase.canManageAcl;
  const dirty =
    name !== knowledgeBase.name ||
    description !== knowledgeBase.description ||
    ownerDepartmentId !== (knowledgeBase.ownerDepartmentId ?? "") ||
    retrievalTopK !== knowledgeBase.retrievalTopK ||
    retrievalSimilarityThreshold !== knowledgeBase.retrievalSimilarityThreshold ||
    retrievalVectorWeight !== knowledgeBase.retrievalVectorWeight;

  function handleReset() {
    setName(knowledgeBase.name);
    setDescription(knowledgeBase.description);
    setOwnerDepartmentId(knowledgeBase.ownerDepartmentId ?? "");
    setRetrievalTopK(knowledgeBase.retrievalTopK);
    setRetrievalSimilarityThreshold(knowledgeBase.retrievalSimilarityThreshold);
    setRetrievalVectorWeight(knowledgeBase.retrievalVectorWeight);
    setError(null);
  }

  async function handleSave() {
    if (name.trim().length < 2) {
      setError({ field: "name", message: "名称至少需要 2 个字符" });
      return;
    }
    if (!Number.isFinite(retrievalTopK) || retrievalTopK < 1 || retrievalTopK > 12) {
      setError({ field: "retrieval", message: "Top-K 必须是 1 到 12 之间的整数" });
      return;
    }
    if (
      !Number.isFinite(retrievalSimilarityThreshold) ||
      retrievalSimilarityThreshold < 0 ||
      retrievalSimilarityThreshold > 1
    ) {
      setError({ field: "retrieval", message: "相似度阈值必须在 0 到 1 之间" });
      return;
    }
    if (
      !Number.isFinite(retrievalVectorWeight) ||
      retrievalVectorWeight < 0 ||
      retrievalVectorWeight > 1
    ) {
      setError({ field: "retrieval", message: "向量权重必须在 0 到 1 之间" });
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const nextName = name.trim();
      const nextDescription = description.trim();
      const nextTopK = Math.round(retrievalTopK);
      await updateKnowledgeBase(knowledgeBase.id, {
        name: nextName,
        description: nextDescription,
        ownerDepartmentId: ownerDepartmentId || null,
        retrievalTopK: nextTopK,
        retrievalSimilarityThreshold,
        retrievalVectorWeight,
      });
      setName(nextName);
      setDescription(nextDescription);
      setRetrievalTopK(nextTopK);
      showToast("知识库设置已保存");
    } catch (cause) {
      await handleApiError(cause);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleting) {
      return;
    }
    setDeleting(true);
    try {
      await deleteKnowledgeBase(knowledgeBase.id);
      showToast("知识库已删除");
      setDeleteOpen(false);
      onDeleted();
    } catch (cause) {
      await handleApiError(cause);
    } finally {
      setDeleting(false);
    }
  }

  const readOnlyItems: Array<{
    label: string;
    value: string;
    mono?: boolean;
    tabular?: boolean;
  }> = [
    { label: "Embedding 模型", value: knowledgeBase.embeddingModel },
    { label: "RAGFlow 数据集", value: knowledgeBase.ragflowDatasetId, mono: true },
    {
      label: "创建者",
      value:
        members.find((member) => member.id === knowledgeBase.ownerId)?.displayName ??
        knowledgeBase.ownerId ??
        "—",
    },
    { label: "创建时间", value: knowledgeBase.createdAt.slice(0, 10) },
    { label: "最近变更", value: knowledgeBase.updatedLabel },
    { label: "ACL 版本", value: String(knowledgeBase.aclVersion), tabular: true },
  ];

  const saveStatus = !canEdit
    ? { tone: "bg-subtle", text: "当前角色为只读，无法修改设置。" }
    : saving
      ? { tone: "bg-accent", text: "正在保存设置…" }
      : dirty
        ? { tone: "bg-warning", text: "有未保存的修改。" }
        : { tone: "bg-success", text: "设置已保存，所有更改已同步。" };

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-fg">基本信息</h2>
          <p className="mt-0.5 text-xs text-muted">用于列表展示和归属管理，不改变文档访问权限。</p>
        </div>
        <div className="grid max-w-3xl items-start gap-3 p-4 sm:grid-cols-2 sm:px-5">
          <FormField
            id="settings-name"
            label="名称"
            required
            error={error?.field === "name" ? error.message : undefined}
          >
            <input
              id="settings-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              disabled={!canEdit || saving}
              aria-invalid={error?.field === "name" ? true : undefined}
              aria-describedby={error?.field === "name" ? "settings-name-error" : undefined}
              className={inputClass}
            />
          </FormField>
          <FormField
            id="settings-department"
            label="归属部门"
            hint="仅用于归属展示与筛选，不影响文档访问权限。"
          >
            <select
              id="settings-department"
              value={ownerDepartmentId}
              onChange={(event) => setOwnerDepartmentId(event.target.value)}
              disabled={!canEdit || saving}
              className={selectClass}
            >
              <option value="">未设置</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </FormField>
          <div className="sm:col-span-2">
            <FormField id="settings-description" label="描述">
              <textarea
                id="settings-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={!canEdit || saving}
                rows={3}
                className={textareaClass}
              />
            </FormField>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-fg">检索配置</h2>
          <p className="mt-0.5 text-xs text-muted">
            Embedding 模型和数据集在创建时确定；检索参数会应用到下一次提问。
          </p>
        </div>
        <div className="p-4 sm:px-5 sm:py-4">
          <div className="rounded-lg border border-border bg-surface-2/50 p-3.5">
            <div className="flex items-center gap-1.5">
              <Icon name="lock" size={12} className="text-subtle" />
              <h3 className="text-[11px] font-semibold tracking-wide text-subtle">只读信息</h3>
            </div>
            <dl className="mt-2.5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {readOnlyItems.map((item) => (
                <div key={item.label} className="min-w-0">
                  <dt className="text-[11px] font-medium text-subtle">{item.label}</dt>
                  <dd
                    className={cn(
                      "mt-0.5 text-[13px] leading-5 text-fg",
                      item.mono && "break-all font-mono text-[11px]",
                      item.tabular && "tabular-nums",
                    )}
                  >
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[11px] font-semibold tracking-wide text-subtle">检索参数</h3>
              <span className="text-[11px] text-subtle">修改后下一次提问生效</span>
            </div>
            <div className="mt-2 grid max-w-3xl gap-3 sm:grid-cols-3">
              <FormField id="settings-top-k" label="Top-K">
                <input
                  id="settings-top-k"
                  type="number"
                  min={1}
                  max={12}
                  value={retrievalTopK}
                  onChange={(event) => {
                    setRetrievalTopK(Number(event.target.value));
                    setError(null);
                  }}
                  disabled={!canEdit || saving}
                  aria-invalid={error?.field === "retrieval" ? true : undefined}
                  aria-describedby={
                    error?.field === "retrieval" ? "settings-retrieval-error" : undefined
                  }
                  className={inputClass}
                />
              </FormField>
              <FormField id="settings-threshold" label="相似度阈值">
                <input
                  id="settings-threshold"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={retrievalSimilarityThreshold}
                  onChange={(event) => {
                    setRetrievalSimilarityThreshold(Number(event.target.value));
                    setError(null);
                  }}
                  disabled={!canEdit || saving}
                  aria-invalid={error?.field === "retrieval" ? true : undefined}
                  aria-describedby={
                    error?.field === "retrieval" ? "settings-retrieval-error" : undefined
                  }
                  className={inputClass}
                />
              </FormField>
              <FormField id="settings-vector-weight" label="向量权重">
                <input
                  id="settings-vector-weight"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={retrievalVectorWeight}
                  onChange={(event) => {
                    setRetrievalVectorWeight(Number(event.target.value));
                    setError(null);
                  }}
                  disabled={!canEdit || saving}
                  aria-invalid={error?.field === "retrieval" ? true : undefined}
                  aria-describedby={
                    error?.field === "retrieval" ? "settings-retrieval-error" : undefined
                  }
                  className={inputClass}
                />
              </FormField>
            </div>
            {error?.field === "retrieval" ? (
              <p
                id="settings-retrieval-error"
                role="alert"
                className="mt-2 flex items-center gap-1.5 text-xs text-danger"
              >
                <Icon name="alert-circle" size={13} />
                {error.message}
              </p>
            ) : null}
            <p className="mt-2 text-[11px] leading-5 text-subtle">
              向量权重越高越偏向语义检索；越低越偏向关键词检索。
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-2 text-xs text-muted" aria-live="polite">
          <span
            className={cn("size-1.5 shrink-0 rounded-full", saveStatus.tone)}
            aria-hidden="true"
          />
          <span>{saveStatus.text}</span>
        </div>
        <div className="flex items-center justify-end gap-2">
          {dirty && !saving && canEdit ? (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              放弃修改
            </Button>
          ) : null}
          <Button
            onClick={() => void handleSave()}
            disabled={!dirty || saving || !canEdit}
            className="min-w-[104px]"
          >
            {saving ? <Spinner className="size-3.5" /> : null}
            {saving ? "保存中…" : "保存设置"}
          </Button>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
              <Icon name="triangle-alert" size={15} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-fg">危险操作</h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                删除后会同时移除其中的 {knowledgeBase.documents.length}{" "}
                篇文档、全部知识库默认权限与文档级权限，请谨慎操作。
              </p>
            </div>
          </div>
          {canEdit ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              className="self-start sm:self-auto"
            >
              <Icon name="trash" size={14} />
              删除知识库
            </Button>
          ) : (
            <Badge tone="neutral" className="self-start sm:self-auto">
              只读
            </Badge>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void handleDelete()}
        title="删除知识库？"
        description={`将软删除「${knowledgeBase.name}」及其 ${knowledgeBase.documents.length} 篇文档、全部知识库默认权限与文档级权限。RAGFlow 数据集和本地文件会尽力清理，失败会记录审计。`}
        confirmLabel={deleting ? "删除中…" : "删除知识库"}
        tone="danger"
        requireText={knowledgeBase.name}
      />
    </div>
  );
}
