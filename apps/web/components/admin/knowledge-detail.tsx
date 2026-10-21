"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  type AclPermission,
  type AclSubject,
  type AdminDocument,
  type AdminKnowledgeBase,
  documentAccessCounts,
  documentStats,
  findKnowledgeBase,
  matchesSubject,
  subjectKey,
  subjectMemberCount,
  subjectName,
  users,
} from "@/lib/admin-data";
import { cn } from "@/lib/utils";
import { Icon } from "../icons";
import { IconButton } from "../ui";
import { BulkAclDialog, DocumentAclDrawer, SubjectSelect } from "./acl";
import { useAdminData } from "./admin-data";
import { ConfirmDialog } from "./confirm-dialog";
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
  TableShell,
  tdClass,
  textareaClass,
  thClass,
  trClass,
} from "./ui";
import { UploadDrawer } from "./upload-drawer";

type TabId = "documents" | "access" | "settings";
type StatusFilter = "all" | "ready" | "parsing" | "failed" | "no-access" | "exceptions";

const filters: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "ready", label: "可检索" },
  { id: "parsing", label: "解析中" },
  { id: "failed", label: "解析失败" },
  { id: "no-access", label: "无人可访问" },
  { id: "exceptions", label: "有例外" },
];

export function KnowledgeDetailPage({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const { knowledgeBases } = useAdminData();
  const knowledgeBase = findKnowledgeBase(knowledgeBases, knowledgeBaseId);
  const [tab, setTab] = useState<TabId>("documents");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [aclDocumentId, setAclDocumentId] = useState<string | null>(null);

  if (!knowledgeBase) {
    return (
      <div className="space-y-6">
        <PageHeader
          backHref="/knowledge"
          backLabel="返回知识库"
          eyebrow="Knowledge"
          title="知识库不存在"
          description="它可能已被删除，或者链接已经失效。"
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
          <>
            <LinkButton href="/permissions">
              <Icon name="shield-check" size={14} />
              文档权限
            </LinkButton>
            <Button onClick={() => setUploadOpen(true)}>
              <Icon name="upload" size={14} />
              上传文档
            </Button>
          </>
        }
      />

      <StatStrip
        items={[
          { label: "文档总数", value: stats.total, hint: "不含已删除" },
          { label: "可检索", value: stats.ready, hint: "解析完成" },
          {
            label: "解析中",
            value: stats.parsing,
            hint: "完成后可检索",
            tone: stats.parsing > 0 ? "warning" : "default",
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
          { id: "access", label: "访问范围", count: knowledgeBase.defaultSubjects.length },
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
          />
        ) : null}
        {tab === "access" ? (
          <AccessTab knowledgeBase={knowledgeBase} onOpenAcl={setAclDocumentId} />
        ) : null}
        {tab === "settings" ? <SettingsTab knowledgeBase={knowledgeBase} /> : null}
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
    </div>
  );
}

function DocumentsTab({
  knowledgeBase,
  onOpenAcl,
  onUpload,
}: {
  knowledgeBase: AdminKnowledgeBase;
  onOpenAcl: (documentId: string) => void;
  onUpload: () => void;
}) {
  const { deleteDocuments, retryDocument } = useAdminData();
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkPermission, setBulkPermission] = useState<AclPermission | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleteDocumentId, setDeleteDocumentId] = useState<string | null>(null);

  const normalized = query.trim().toLowerCase();
  const rows = knowledgeBase.documents.filter((document) => {
    if (normalized && !document.title.toLowerCase().includes(normalized)) {
      return false;
    }
    if (statusFilter === "no-access") {
      return documentAccessCounts(knowledgeBase, document).allowed.length === 0;
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
  const deleteDocument = knowledgeBase.documents.find(
    (document) => document.id === deleteDocumentId,
  );

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

  function handleDelete() {
    if (!deleteDocumentId) {
      return;
    }
    deleteDocuments(knowledgeBase.id, [deleteDocumentId]);
    showToast("文档已删除");
    setDeleteDocumentId(null);
  }

  function handleBulkDelete() {
    deleteDocuments(knowledgeBase.id, selectedIds);
    showToast(`已删除 ${selectedIds.length} 篇文档`);
    setSelectedIds([]);
    setBulkDeleteOpen(false);
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
              description="上传 PDF、DOCX、MD 或 TXT，解析完成后会自动进入检索范围。"
              action={
                <Button onClick={onUpload}>
                  <Icon name="upload" size={15} />
                  上传文档
                </Button>
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
                  <th className={thClass}>例外</th>
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
                    onRetry={() => {
                      retryDocument(knowledgeBase.id, document.id);
                      showToast("已重新加入解析队列");
                    }}
                    onDelete={() => setDeleteDocumentId(document.id)}
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
                onRetry={() => {
                  retryDocument(knowledgeBase.id, document.id);
                  showToast("已重新加入解析队列");
                }}
                onDelete={() => setDeleteDocumentId(document.id)}
              />
            ))}
          </ul>
        </>
      )}

      {selectedIds.length > 0 ? (
        <div className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-pop sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
          <p className="mr-auto text-xs font-medium text-fg">已选 {selectedIds.length} 篇</p>
          <Button size="sm" variant="secondary" onClick={() => setBulkPermission("read")}>
            <Icon name="shield-check" size={13} />
            授予读取
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setBulkPermission("deny")}>
            <Icon name="ban" size={13} />
            添加拒绝
          </Button>
          <Button size="sm" variant="danger" onClick={() => setBulkDeleteOpen(true)}>
            删除
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
            清除
          </Button>
        </div>
      ) : null}

      {bulkPermission ? (
        <BulkAclDialog
          documentIds={selectedIds}
          initialPermission={bulkPermission}
          onClose={() => {
            setBulkPermission(null);
            setSelectedIds([]);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteDocument)}
        onClose={() => setDeleteDocumentId(null)}
        onConfirm={handleDelete}
        title="删除文档？"
        description={
          deleteDocument
            ? `「${deleteDocument.title}」会从知识库和检索范围中移除，引用记录保留。此操作不可撤销。`
            : ""
        }
        confirmLabel="删除文档"
        tone="danger"
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title={`删除 ${selectedIds.length} 篇文档？`}
        description="文档会从知识库和检索范围中移除，引用记录保留。此操作不可撤销。"
        confirmLabel="批量删除"
        tone="danger"
      />

      {selectedIds.length > 0 ? <div aria-hidden="true" className="h-16 sm:h-20" /> : null}
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
  onDelete,
}: {
  knowledgeBase: AdminKnowledgeBase;
  document: AdminDocument;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onOpenAcl: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const counts = documentAccessCounts(knowledgeBase, document);
  return (
    <tr className={cn(trClass, selected && "bg-accent-soft/40")}>
      <td className={tdClass}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onToggle(event.target.checked)}
          aria-label={`选择 ${document.title}`}
          className="size-4 cursor-pointer rounded border-border accent-accent"
        />
      </td>
      <td className={tdClass}>
        <p className="max-w-[300px] truncate text-sm font-medium text-fg">{document.title}</p>
        <p className="mt-0.5 text-[11px] text-subtle">
          {document.sizeLabel} · {document.updatedLabel}
        </p>
      </td>
      <td className={tdClass}>
        <StatusBadge status={document.status} />
      </td>
      <td className={tdClass}>
        {counts.allowed.length === 0 ? (
          <Badge tone="warning">无人可访问</Badge>
        ) : (
          <>
            <p className="text-sm tabular-nums text-fg">{counts.allowed.length} 人可读</p>
            <p className="mt-0.5 text-[11px] text-subtle">默认 + {counts.exceptionCount} 条例外</p>
          </>
        )}
      </td>
      <td className={tdClass}>
        {counts.exceptionCount === 0 ? (
          <span className="text-xs text-subtle">—</span>
        ) : (
          <>
            <p className="text-sm tabular-nums text-fg">{counts.exceptionCount} 条</p>
            {counts.denyCount > 0 ? (
              <p className="mt-0.5 text-[11px] text-danger">{counts.denyCount} 条拒绝</p>
            ) : null}
          </>
        )}
      </td>
      <td className={`${tdClass} hidden xl:table-cell`}>
        <p className="text-xs text-muted">{document.updatedLabel}</p>
      </td>
      <td className={`${tdClass} text-right`}>
        <div className="flex items-center justify-end gap-0.5">
          <IconButton label="设置权限" icon="shield-check" onClick={onOpenAcl} />
          {document.status === "failed" ? (
            <IconButton label="重新解析" icon="refresh" onClick={onRetry} />
          ) : null}
          <IconButton label="删除文档" icon="trash" onClick={onDelete} />
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
  onDelete,
}: {
  knowledgeBase: AdminKnowledgeBase;
  document: AdminDocument;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onOpenAcl: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const counts = documentAccessCounts(knowledgeBase, document);
  return (
    <li className="rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onToggle(event.target.checked)}
          aria-label={`选择 ${document.title}`}
          className="mt-1.5 size-4 shrink-0 cursor-pointer rounded border-border accent-accent"
        />
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-subtle">
          <Icon name="file-text" size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg">{document.title}</p>
          <p className="mt-0.5 text-[11px] text-subtle">
            {document.sizeLabel} · {document.updatedLabel}
          </p>
        </div>
        <StatusBadge status={document.status} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
        {counts.allowed.length === 0 ? (
          <Badge tone="warning">无人可访问</Badge>
        ) : (
          <span className="text-fg">{counts.allowed.length} 人可读</span>
        )}
        <span>{counts.exceptionCount} 条文档例外</span>
        {counts.denyCount > 0 ? (
          <span className="text-danger">{counts.denyCount} 条拒绝</span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onOpenAcl}>
          <Icon name="shield-check" size={13} />
          设置权限
        </Button>
        {document.status === "failed" ? (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            <Icon name="refresh" size={13} />
            重新解析
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Icon name="trash" size={13} />
          删除
        </Button>
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
  const { setDefaultSubjects } = useAdminData();
  const { showToast } = useToast();
  const [subjects, setSubjects] = useState<AclSubject[]>(knowledgeBase.defaultSubjects);
  const [subjectValue, setSubjectValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const dirty =
    subjects.length !== knowledgeBase.defaultSubjects.length ||
    subjects.some(
      (subject) =>
        !knowledgeBase.defaultSubjects.some((item) => subjectKey(item) === subjectKey(subject)),
    );
  const affectedPeople = users.filter(
    (user) =>
      user.role !== "tenant_admin" &&
      user.status === "active" &&
      subjects.some((subject) => matchesSubject(subject, user)),
  ).length;
  const docsWithExceptions = knowledgeBase.documents.filter(
    (document) => document.exceptions.length > 0,
  );
  const noAccessDocuments = knowledgeBase.documents.filter(
    (document) => documentAccessCounts(knowledgeBase, document).allowed.length === 0,
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
      setError("请选择用户或用户组");
      return;
    }
    if (subjects.some((item) => subjectKey(item) === subjectKey(subject))) {
      setError("该主体已在默认范围中");
      return;
    }
    setSubjects((previous) => [...previous, subject]);
    setSubjectValue("");
    setError(null);
  }

  function handleSave() {
    setDefaultSubjects(knowledgeBase.id, subjects);
    showToast("默认访问范围已更新，下一次提问生效");
    setConfirmOpen(false);
  }

  return (
    <div className="space-y-4">
      <InfoBanner tone="accent" icon="shield-check" title="默认范围对全库生效">
        知识库默认范围应用于全部文档；文档例外叠加在其上，拒绝规则优先。普通成员的可见人数与访问判断都会实时按此计算。
      </InfoBanner>

      <div className="rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-fg">默认访问范围</h2>
            <p className="mt-0.5 text-[11px] text-subtle">
              {subjects.length} 个主体 · 预计 {affectedPeople} 名普通成员可读
            </p>
          </div>
          <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={!dirty}>
            保存默认范围
          </Button>
        </div>

        <div className="p-4">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <SubjectSelect
              value={subjectValue}
              onChange={(value) => {
                setSubjectValue(value);
                setError(null);
              }}
              label="选择默认访问范围的用户或用户组"
            />
            <Button variant="secondary" onClick={addSubject}>
              <Icon name="plus" size={14} />
              添加主体
            </Button>
          </div>
          {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}

          {subjects.length === 0 ? (
            <div className="mt-3">
              <InfoBanner tone="warning" icon="lock" title="未设置默认范围">
                普通成员无法读取该知识库中的文档，只有租户管理员可读。可以在下方为单篇文档添加例外。
              </InfoBanner>
            </div>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {subjects.map((subject) => (
                <li
                  key={subjectKey(subject)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                >
                  <Icon
                    name={subject.type === "group" ? "users" : "user"}
                    size={14}
                    className="shrink-0 text-subtle"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {subjectName(subject)}
                  </span>
                  <span className="shrink-0 text-[11px] text-subtle">
                    {subjectMemberCount(subject)} 人
                  </span>
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
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-fg">文档例外</h2>
            <p className="mt-0.5 text-[11px] text-subtle">
              {docsWithExceptions.length} 篇文档有独立权限
            </p>
          </div>
          <LinkButton href="/permissions" size="sm">
            查看全部文档权限
            <Icon name="chevron-right" size={13} />
          </LinkButton>
        </div>
        {docsWithExceptions.length === 0 ? (
          <p className="px-4 py-5 text-xs text-subtle">
            没有文档例外。所有文档只应用知识库默认范围。
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {docsWithExceptions.map((document) => {
              const counts = documentAccessCounts(knowledgeBase, document);
              return (
                <li key={document.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">{document.title}</p>
                    <p className="mt-0.5 text-[11px] text-subtle">
                      {counts.allowed.length} 人可读 · {counts.exceptionCount} 条例外
                      {counts.denyCount > 0 ? ` · ${counts.denyCount} 条拒绝` : ""}
                    </p>
                  </div>
                  <StatusBadge status={document.status} />
                  <Button size="sm" variant="secondary" onClick={() => onOpenAcl(document.id)}>
                    调整
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {noAccessDocuments.length > 0 ? (
        <InfoBanner tone="warning" icon="alert-circle" title="有文档没有任何普通成员可读">
          {noAccessDocuments.length} 篇文档当前只有租户管理员可读。请确认默认范围或添加文档例外。
        </InfoBanner>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSave}
        title="保存默认访问范围？"
        description={`将影响 ${knowledgeBase.documents.length} 篇文档，预计 ${affectedPeople} 名普通成员可读。保存后权限将在下一次提问时生效。`}
        confirmLabel={subjects.length === 0 ? "保存并移除默认访问" : "保存默认范围"}
        tone={subjects.length === 0 ? "danger" : "primary"}
      />
    </div>
  );
}

function SettingsTab({ knowledgeBase }: { knowledgeBase: AdminKnowledgeBase }) {
  const { updateKnowledgeBase, deleteKnowledgeBase } = useAdminData();
  const { showToast } = useToast();
  const router = useRouter();
  const [name, setName] = useState(knowledgeBase.name);
  const [description, setDescription] = useState(knowledgeBase.description);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const dirty = name !== knowledgeBase.name || description !== knowledgeBase.description;

  function handleSave() {
    if (name.trim().length < 2) {
      setError("名称至少需要 2 个字符");
      return;
    }
    updateKnowledgeBase(knowledgeBase.id, {
      name: name.trim(),
      description: description.trim(),
    });
    setError(null);
    showToast("知识库设置已更新");
  }

  function handleDelete() {
    deleteKnowledgeBase(knowledgeBase.id);
    showToast("知识库已删除");
    setDeleteOpen(false);
    router.push("/knowledge");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-medium text-fg">基本信息</h2>
        <div className="mt-3 max-w-2xl space-y-4">
          <FormField id="settings-name" label="名称" required error={error ?? undefined}>
            <input
              id="settings-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "settings-name-error" : undefined}
              className={inputClass}
            />
          </FormField>
          <FormField id="settings-description" label="描述">
            <textarea
              id="settings-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className={textareaClass}
            />
          </FormField>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={!dirty}>
              保存设置
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-medium text-fg">检索配置</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] text-subtle">Embedding 模型</dt>
            <dd className="mt-1 text-sm text-fg">{knowledgeBase.embeddingModel}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-subtle">RAGFlow 数据集</dt>
            <dd className="mt-1 font-mono text-xs text-fg">{knowledgeBase.ragflowDatasetId}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-subtle">创建时间</dt>
            <dd className="mt-1 text-sm text-fg">{knowledgeBase.createdAt.slice(0, 10)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-subtle">最近变更</dt>
            <dd className="mt-1 text-sm text-fg">{knowledgeBase.updatedLabel}</dd>
          </div>
        </dl>
        <div className="mt-3">
          <InfoBanner tone="warning" icon="lock" title="配置锁定">
            Embedding 模型创建后不可更改；更换模型需要新建知识库并重新解析全部文档。RAGFlow API Key
            只保存在服务端。
          </InfoBanner>
        </div>
      </div>

      <div className="rounded-xl border border-danger/30 bg-danger-soft/40 p-4 sm:p-5">
        <h2 className="text-sm font-medium text-fg">危险操作</h2>
        <p className="mt-1 text-xs leading-5 text-muted">
          删除知识库会同时移除其中的 {knowledgeBase.documents.length} 篇文档及全部文档权限规则。
        </p>
        <div className="mt-3">
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            <Icon name="trash" size={14} />
            删除知识库
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="删除知识库？"
        description={`「${knowledgeBase.name}」及其中 ${knowledgeBase.documents.length} 篇文档、全部权限规则会被永久删除。此操作不可撤销。`}
        confirmLabel="永久删除"
        tone="danger"
        requireText={knowledgeBase.name}
      />
    </div>
  );
}
