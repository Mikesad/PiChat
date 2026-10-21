"use client";

import { useId, useMemo, useState } from "react";
import {
  type AdminDocument,
  type AdminKnowledgeBase,
  documentAccessCounts,
} from "@/lib/admin-data";
import { cn } from "@/lib/utils";
import { Icon } from "../icons";
import { BulkAclDialog, DocumentAclDrawer } from "./acl";
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
type BulkPermission = "read" | "deny";

const statusFilters: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "全部状态" },
  { id: "ready", label: "可检索" },
  { id: "parsing", label: "解析中" },
  { id: "failed", label: "解析失败" },
];

interface PermissionRow {
  knowledgeBase: AdminKnowledgeBase;
  document: AdminDocument;
  counts: ReturnType<typeof documentAccessCounts>;
}

export function PermissionsPage() {
  const { knowledgeBases } = useAdminData();
  const [query, setQuery] = useState("");
  const [knowledgeBaseFilter, setKnowledgeBaseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [onlyNoAccess, setOnlyNoAccess] = useState(false);
  const [onlyDeny, setOnlyDeny] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [aclDocumentId, setAclDocumentId] = useState<string | null>(null);
  const [bulkPermission, setBulkPermission] = useState<BulkPermission | null>(null);
  const kbSelectId = useId();

  const rows = useMemo<PermissionRow[]>(
    () =>
      knowledgeBases.flatMap((knowledgeBase) =>
        knowledgeBase.documents
          .filter((document) => document.status !== "deleted")
          .map((document) => ({
            knowledgeBase,
            document,
            counts: documentAccessCounts(knowledgeBase, document),
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
      if (onlyNoAccess && row.counts.allowed.length > 0) {
        return false;
      }
      if (onlyDeny && row.counts.denyCount === 0) {
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
      return left.counts.allowed.length - right.counts.allowed.length;
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
    const noAccess = rows.filter((row) => row.counts.allowed.length === 0).length;
    const withDeny = rows.filter((row) => row.counts.denyCount > 0).length;
    return { noAccess, withDeny, documents: rows.length, knowledgeBases: knowledgeBases.length };
  }, [rows, knowledgeBases.length]);

  const visibleIds = filteredRows.map((row) => row.document.id);
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

  function openAcl(documentId: string) {
    setAclDocumentId(documentId);
  }

  return (
    <div className="space-y-6">
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

      <StatStrip
        items={[
          { label: "文档总数", value: totals.documents, hint: "不含已删除" },
          {
            label: "无人可访问",
            value: totals.noAccess,
            hint: "仅管理员可读",
            tone: totals.noAccess > 0 ? "warning" : "default",
          },
          {
            label: "含拒绝规则",
            value: totals.withDeny,
            hint: "拒绝优先",
            tone: totals.withDeny > 0 ? "danger" : "default",
          },
          { label: "知识库", value: totals.knowledgeBases, hint: "当前租户" },
        ]}
      />

      <InfoBanner tone="accent" icon="info" title="有效人数不含租户管理员">
        租户管理员始终可读全部文档，不计入“N
        人可读”。文档例外叠加在知识库默认范围上，任何拒绝规则都会覆盖读取权限。
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
                ? "先在知识库中上传文档，解析完成后即可在这里配置权限。"
                : "调整筛选条件，或清除筛选后查看全部文档。"
            }
            action={
              rows.length === 0 ? (
                <LinkButton href="/knowledge" variant="primary">
                  去知识库上传
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
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.document.id)}
                        onChange={(event) => toggleOne(row.document.id, event.target.checked)}
                        aria-label={`选择 ${row.document.title}`}
                        className="size-4 cursor-pointer rounded border-border accent-accent"
                      />
                    </td>
                    <td className={tdClass}>
                      <button
                        type="button"
                        onClick={() => openAcl(row.document.id)}
                        className="max-w-[320px] cursor-pointer truncate text-left text-sm font-medium text-fg transition-colors hover:text-accent-text"
                      >
                        {row.document.title}
                      </button>
                      <p className="mt-0.5 text-[11px] text-subtle">
                        {row.document.sizeLabel} · {row.document.updatedLabel}
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
                      {row.counts.allowed.length === 0 ? (
                        <Badge tone="warning">无人可访问</Badge>
                      ) : (
                        <>
                          <p className="text-sm tabular-nums text-fg">
                            {row.counts.allowed.length} 人
                          </p>
                          <p className="mt-0.5 text-[11px] text-subtle">
                            {row.counts.denied.length} 人被拒绝
                          </p>
                        </>
                      )}
                    </td>
                    <td className={tdClass}>
                      {row.counts.exceptionCount === 0 ? (
                        <span className="text-xs text-subtle">—</span>
                      ) : (
                        <>
                          <p className="text-sm tabular-nums text-fg">
                            {row.counts.exceptionCount} 条
                          </p>
                          {row.counts.denyCount > 0 ? (
                            <p className="mt-0.5 text-[11px] text-danger">
                              {row.counts.denyCount} 条拒绝
                            </p>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className={`${tdClass} hidden xl:table-cell`}>
                      <p className="text-xs text-muted">{row.document.updatedLabel}</p>
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openAcl(row.document.id)}
                      >
                        <Icon name="shield-check" size={13} />
                        设置权限
                      </Button>
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
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(row.document.id)}
                    onChange={(event) => toggleOne(row.document.id, event.target.checked)}
                    aria-label={`选择 ${row.document.title}`}
                    className="mt-1.5 size-4 shrink-0 cursor-pointer rounded border-border accent-accent"
                  />
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-subtle">
                    <Icon name="file-text" size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => openAcl(row.document.id)}
                      className="block w-full cursor-pointer truncate text-left text-sm font-medium text-fg"
                    >
                      {row.document.title}
                    </button>
                    <p className="mt-0.5 truncate text-[11px] text-subtle">
                      {row.knowledgeBase.name} · {row.document.updatedLabel}
                    </p>
                  </div>
                  <StatusBadge status={row.document.status} />
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
                  {row.counts.allowed.length === 0 ? (
                    <Badge tone="warning">无人可访问</Badge>
                  ) : (
                    <span className="text-fg">{row.counts.allowed.length} 人可读</span>
                  )}
                  <span>{row.counts.exceptionCount} 条例外</span>
                  {row.counts.denyCount > 0 ? (
                    <span className="text-danger">{row.counts.denyCount} 条拒绝</span>
                  ) : null}
                </div>
                <div className="mt-3">
                  <Button size="sm" variant="secondary" onClick={() => openAcl(row.document.id)}>
                    <Icon name="shield-check" size={13} />
                    设置权限
                  </Button>
                </div>
              </li>
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

      {aclDocumentId ? (
        <DocumentAclDrawer
          key={aclDocumentId}
          documentId={aclDocumentId}
          onClose={() => setAclDocumentId(null)}
        />
      ) : null}

      {selectedIds.length > 0 ? <div aria-hidden="true" className="h-16 sm:h-20" /> : null}
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
