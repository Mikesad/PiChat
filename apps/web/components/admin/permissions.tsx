"use client";

import { useId, useMemo, useState } from "react";
import type { AdminDocument, AdminKnowledgeBase } from "@/lib/admin-data";
import { cn } from "@/lib/utils";
import { useAuth } from "../auth/auth-provider";
import { Icon, Spinner } from "../icons";
import { BulkAclDrawer, DocumentAclDrawer } from "./acl";
import { useAdminData } from "./admin-data";
import {
  Badge,
  Button,
  EmptyState,
  FilterChip,
  InfoBanner,
  LinkButton,
  PageHeader,
  SearchInput,
  SelectAllCheckbox,
  StatStrip,
  StatusBadge,
  TableShell,
  tdClass,
  thClass,
  trClass,
} from "./ui";

type StatusFilter = "all" | "ready" | "parsing" | "failed";
type SortKey = "title" | "updated" | "access";
type SortDirection = "asc" | "desc";

const statusFilters: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "全部状态" },
  { id: "ready", label: "可检索" },
  { id: "parsing", label: "解析中" },
  { id: "failed", label: "解析失败" },
];

interface PermissionRow {
  knowledgeBase: AdminKnowledgeBase;
  document: AdminDocument;
  denyCount: number;
}

export function PermissionsPage() {
  const { knowledgeBases, status, error, reload } = useAdminData();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [knowledgeBaseFilter, setKnowledgeBaseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [onlyNoAccess, setOnlyNoAccess] = useState(false);
  const [onlyDeny, setOnlyDeny] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [aclDocumentId, setAclDocumentId] = useState<string | null>(null);
  const [bulkAclOpen, setBulkAclOpen] = useState(false);
  const kbSelectId = useId();
  const canManage = user?.role === "tenant_admin" || user?.role === "knowledge_admin";

  const rows = useMemo<PermissionRow[]>(
    () =>
      knowledgeBases.flatMap((knowledgeBase) =>
        knowledgeBase.documents
          .filter((document) => document.status !== "deleted")
          .map((document) => ({
            knowledgeBase,
            document,
            denyCount: document.exceptions.filter((exception) => exception.permission === "deny")
              .length,
          })),
      ),
    [knowledgeBases],
  );

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (
        normalized &&
        !row.document.title.toLowerCase().includes(normalized) &&
        !row.knowledgeBase.name.toLowerCase().includes(normalized)
      ) {
        return false;
      }
      if (knowledgeBaseFilter !== "all" && row.knowledgeBase.id !== knowledgeBaseFilter) {
        return false;
      }
      if (statusFilter !== "all" && row.document.status !== statusFilter) {
        return false;
      }
      if (onlyNoAccess && row.document.effectiveReaderCount > 0) {
        return false;
      }
      if (onlyDeny && row.denyCount === 0) {
        return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((left, right) => {
      if (sortKey === "title") {
        return left.document.title.localeCompare(right.document.title, "zh-CN");
      }
      if (sortKey === "updated") {
        return left.document.updatedAt.localeCompare(right.document.updatedAt);
      }
      return left.document.effectiveReaderCount - right.document.effectiveReaderCount;
    });

    return sortDirection === "asc" ? sorted : sorted.reverse();
  }, [
    rows,
    query,
    knowledgeBaseFilter,
    statusFilter,
    onlyNoAccess,
    onlyDeny,
    sortKey,
    sortDirection,
  ]);

  const totals = useMemo(() => {
    const noAccess = rows.filter((row) => row.document.effectiveReaderCount === 0).length;
    const withDeny = rows.filter((row) => row.denyCount > 0).length;
    return { noAccess, withDeny, documents: rows.length, knowledgeBases: knowledgeBases.length };
  }, [rows, knowledgeBases.length]);

  const visibleIds = filteredRows.map((row) => row.document.id);
  const selectedKnowledgeBaseIds = [
    ...new Set(
      rows
        .filter((row) => selectedIds.includes(row.document.id))
        .map((row) => row.knowledgeBase.id),
    ),
  ];
  const bulkKnowledgeBaseId =
    selectedKnowledgeBaseIds.length === 1 ? (selectedKnowledgeBaseIds[0] ?? null) : null;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.includes(id));
  const hasFilters =
    query.trim().length > 0 ||
    knowledgeBaseFilter !== "all" ||
    statusFilter !== "all" ||
    onlyNoAccess ||
    onlyDeny;

  function clearFilters() {
    setQuery("");
    setKnowledgeBaseFilter("all");
    setStatusFilter("all");
    setOnlyNoAccess(false);
    setOnlyDeny(false);
    setSelectedIds([]);
  }

  function handleSort(next: SortKey) {
    if (next === sortKey) {
      setSortDirection((previous) => (previous === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(next);
    setSortDirection(next === "updated" ? "desc" : "asc");
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

  function openAcl(document: AdminDocument) {
    if (!document.canManageAcl) {
      return;
    }
    setAclDocumentId(document.id);
  }

  const header = (
    <PageHeader
      eyebrow="Access"
      title="文档权限"
      description="按文档管理读取与拒绝规则。默认拒绝，拒绝优先，权限变更在下一次提问时生效。"
      actions={
        <LinkButton href="/knowledge">
          <Icon name="book-open" size={14} />
          管理知识库
        </LinkButton>
      }
    />
  );

  if (knowledgeBases.length === 0 && status === "loading") {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <Spinner className="text-accent" />
          <p className="text-sm text-muted">正在加载文档与权限…</p>
        </div>
      </div>
    );
  }

  if (knowledgeBases.length === 0 && status === "error") {
    return (
      <div className="space-y-6">
        {header}
        <InfoBanner
          tone="danger"
          icon="alert-circle"
          title="文档权限加载失败"
          action={
            <Button size="sm" variant="secondary" onClick={() => void reload()}>
              重试
            </Button>
          }
        >
          {error ?? "请稍后重试。"}
        </InfoBanner>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

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
          { label: "文档总数", value: totals.documents, hint: "不含已删除" },
          {
            label: "无人可访问",
            value: totals.noAccess,
            hint: "有效读者为 0",
            tone: totals.noAccess > 0 ? "warning" : "default",
          },
          {
            label: "含拒绝规则",
            value: totals.withDeny,
            hint: "拒绝优先",
            tone: totals.withDeny > 0 ? "danger" : "default",
          },
          { label: "知识库", value: totals.knowledgeBases, hint: "当前账号可见" },
        ]}
      />

      <InfoBanner tone="accent" icon="info" title="有效人数由服务端计算">
        服务端按本租户活跃用户、知识库默认范围与文档例外计算有效读者，角色覆盖也计入。修改权限后会重新拉取数据。
      </InfoBanner>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onChange={(value) => {
            setQuery(value);
            setSelectedIds([]);
          }}
          placeholder="搜索文档或知识库"
          label="搜索文档或知识库"
        />
        <div className="w-full sm:w-44">
          <label htmlFor={kbSelectId} className="sr-only">
            按知识库筛选
          </label>
          <select
            id={kbSelectId}
            value={knowledgeBaseFilter}
            onChange={(event) => {
              setKnowledgeBaseFilter(event.target.value);
              setSelectedIds([]);
            }}
            className="h-10 w-full cursor-pointer rounded-lg border border-border bg-surface px-2.5 text-sm text-fg transition-colors focus:border-accent sm:h-9"
          >
            <option value="all">全部知识库</option>
            {knowledgeBases.map((knowledgeBase) => (
              <option key={knowledgeBase.id} value={knowledgeBase.id}>
                {knowledgeBase.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {statusFilters.map((filter) => (
            <FilterChip
              key={filter.id}
              active={statusFilter === filter.id}
              onClick={() => {
                setStatusFilter(filter.id);
                setSelectedIds([]);
              }}
            >
              {filter.label}
            </FilterChip>
          ))}
        </div>
        <FilterChip
          active={onlyNoAccess}
          onClick={() => {
            setOnlyNoAccess((previous) => !previous);
            setSelectedIds([]);
          }}
        >
          仅看无人可访问
        </FilterChip>
        <FilterChip
          active={onlyDeny}
          onClick={() => {
            setOnlyDeny((previous) => !previous);
            setSelectedIds([]);
          }}
        >
          仅看有拒绝
        </FilterChip>
        {hasFilters ? (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            清除筛选
          </Button>
        ) : null}
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={rows.length === 0 ? "file-text" : "search"}
            title={rows.length === 0 ? "还没有可管理的文档" : "没有匹配的文档"}
            description={
              rows.length === 0
                ? "当前账号没有可见的文档。上传与解析将在后续冲刺接入。"
                : "调整筛选条件，或清除筛选后查看全部文档。"
            }
            action={
              rows.length === 0 ? (
                <LinkButton href="/knowledge" variant="primary">
                  查看知识库
                </LinkButton>
              ) : (
                <Button variant="secondary" onClick={clearFilters}>
                  清除筛选
                </Button>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="hidden xl:block">
            <TableShell
              minWidth={720}
              footer={
                <>
                  <span>
                    共 {filteredRows.length} 篇 · 已选 {selectedIds.length} 篇
                  </span>
                  <span>拒绝优先于允许</span>
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
                  <SortableHeader
                    label="文档"
                    column="title"
                    sortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <th className={thClass}>知识库</th>
                  <th className={thClass}>状态</th>
                  <SortableHeader
                    label="可见人数"
                    column="access"
                    sortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <th className={thClass}>例外</th>
                  <SortableHeader
                    label="更新"
                    column="updated"
                    sortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="hidden xl:table-cell"
                  />
                  <th className={thClass}>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.document.id}
                    className={cn(
                      trClass,
                      selectedIds.includes(row.document.id) && "bg-accent-soft/40",
                    )}
                  >
                    <td className={tdClass}>
                      {row.document.canManageAcl ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.document.id)}
                          onChange={(event) => toggleOne(row.document.id, event.target.checked)}
                          aria-label={`选择 ${row.document.title}`}
                          className="size-4 cursor-pointer rounded border-border accent-accent"
                        />
                      ) : null}
                    </td>
                    <td className={tdClass}>
                      {row.document.canManageAcl ? (
                        <button
                          type="button"
                          onClick={() => openAcl(row.document)}
                          className="max-w-[320px] cursor-pointer truncate text-left text-sm font-medium text-fg transition-colors hover:text-accent-text"
                        >
                          {row.document.title}
                        </button>
                      ) : (
                        <span className="block max-w-[320px] truncate text-sm font-medium text-fg">
                          {row.document.title}
                        </span>
                      )}
                      <p className="mt-0.5 text-[11px] text-subtle">
                        {row.document.sizeLabel ?? "—"} · {row.document.updatedLabel}
                      </p>
                    </td>
                    <td className={tdClass}>
                      <p className="max-w-[140px] truncate text-xs text-muted">
                        {row.knowledgeBase.name}
                      </p>
                    </td>
                    <td className={tdClass}>
                      <StatusBadge status={row.document.status} />
                    </td>
                    <td className={tdClass}>
                      {row.document.effectiveReaderCount === 0 ? (
                        <Badge tone="warning">无人可访问</Badge>
                      ) : (
                        <>
                          <p className="text-sm tabular-nums text-fg">
                            {row.document.effectiveReaderCount} 人
                          </p>
                          <p className="mt-0.5 text-[11px] text-subtle">服务端有效人数</p>
                        </>
                      )}
                    </td>
                    <td className={tdClass}>
                      {row.document.exceptions.length === 0 ? (
                        <span className="text-xs text-subtle">—</span>
                      ) : (
                        <>
                          <p className="text-sm tabular-nums text-fg">
                            {row.document.exceptions.length} 条
                          </p>
                          {row.denyCount > 0 ? (
                            <p className="mt-0.5 text-[11px] text-danger">{row.denyCount} 条拒绝</p>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className={`${tdClass} hidden xl:table-cell`}>
                      <p className="text-xs text-muted">{row.document.updatedLabel}</p>
                    </td>
                    <td className={`${tdClass} text-right`}>
                      {row.document.canManageAcl ? (
                        <Button size="sm" variant="secondary" onClick={() => openAcl(row.document)}>
                          <Icon name="shield-check" size={13} />
                          设置权限
                        </Button>
                      ) : (
                        <span className="text-xs text-subtle">只读</span>
                      )}
                    </td>
                  </tr>
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
            {filteredRows.map((row) => (
              <li
                key={row.document.id}
                className="rounded-xl border border-border bg-surface p-3.5"
              >
                <div className="flex items-start gap-2.5">
                  {row.document.canManageAcl ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.document.id)}
                      onChange={(event) => toggleOne(row.document.id, event.target.checked)}
                      aria-label={`选择 ${row.document.title}`}
                      className="mt-1.5 size-4 shrink-0 cursor-pointer rounded border-border accent-accent"
                    />
                  ) : null}
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-subtle">
                    <Icon name="file-text" size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {row.document.canManageAcl ? (
                      <button
                        type="button"
                        onClick={() => openAcl(row.document)}
                        className="block w-full cursor-pointer truncate text-left text-sm font-medium text-fg"
                      >
                        {row.document.title}
                      </button>
                    ) : (
                      <p className="truncate text-sm font-medium text-fg">{row.document.title}</p>
                    )}
                    <p className="mt-0.5 truncate text-[11px] text-subtle">
                      {row.knowledgeBase.name} · {row.document.updatedLabel}
                    </p>
                  </div>
                  <StatusBadge status={row.document.status} />
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
                  {row.document.effectiveReaderCount === 0 ? (
                    <Badge tone="warning">无人可访问</Badge>
                  ) : (
                    <span className="text-fg">{row.document.effectiveReaderCount} 人可读</span>
                  )}
                  <span>{row.document.exceptions.length} 条例外</span>
                  {row.denyCount > 0 ? (
                    <span className="text-danger">{row.denyCount} 条拒绝</span>
                  ) : null}
                </div>
                {row.document.canManageAcl ? (
                  <div className="mt-3">
                    <Button size="sm" variant="secondary" onClick={() => openAcl(row.document)}>
                      <Icon name="shield-check" size={13} />
                      设置权限
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-subtle">当前角色只读</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {canManage && selectedIds.length > 0 ? (
        <div className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-pop sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
          <p className="mr-auto text-xs font-medium text-fg">
            已选 {selectedIds.length} 篇
            {selectedKnowledgeBaseIds.length > 1 ? (
              <span className="ml-2 font-normal text-warning">批量授权一次只能选择一个知识库</span>
            ) : null}
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setBulkAclOpen(true)}
            disabled={!bulkKnowledgeBaseId}
          >
            <Icon name="shield-check" size={13} />
            批量授权
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
            清除
          </Button>
        </div>
      ) : null}

      {bulkAclOpen && bulkKnowledgeBaseId ? (
        <BulkAclDrawer
          knowledgeBaseId={bulkKnowledgeBaseId}
          documentIds={selectedIds}
          onClose={() => setBulkAclOpen(false)}
          onApplied={() => setSelectedIds([])}
        />
      ) : null}

      {aclDocumentId ? (
        <DocumentAclDrawer
          key={aclDocumentId}
          documentId={aclDocumentId}
          onClose={() => setAclDocumentId(null)}
        />
      ) : null}

      {canManage && selectedIds.length > 0 ? (
        <div aria-hidden="true" className="h-16 sm:h-20" />
      ) : null}
    </div>
  );
}

function SortableHeader({
  label,
  column,
  sortKey,
  sortDirection,
  onSort,
  className,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (column: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <th
      aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
      className={cn(thClass, className)}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-subtle transition-colors hover:text-fg"
      >
        {label}
        <Icon
          name="arrow-up"
          size={11}
          className={cn(
            "transition-transform duration-150",
            !active && "opacity-40",
            active && sortDirection === "desc" && "rotate-180",
          )}
        />
      </button>
    </th>
  );
}
