"use client";

import { type AuditLogSummary, defaultPageSize, type PaginationMeta } from "@pichat/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AuditAction,
  type AuditLogEntry,
  type AuditMetadataItem,
  type AuditResult,
  auditActionLabels,
  auditResourceLabels,
  auditResultLabels,
  roleLabels,
} from "@/lib/admin-data";
import { ApiError, apiErrorMessage, fetchAuditLogs } from "@/lib/api-client";
import { useAuth } from "../auth/auth-provider";
import { Icon } from "../icons";
import { useDirectory } from "./directory";
import { Drawer } from "./drawer";
import { Pagination } from "./pagination";
import {
  Badge,
  Button,
  EmptyState,
  InfoBanner,
  PageHeader,
  SearchInput,
  StatStrip,
  TableShell,
  tdClass,
  thClass,
  trClass,
} from "./ui";

const metadataLabels: Record<string, string> = {
  name: "名称",
  description: "描述",
  title: "标题",
  changes: "变更字段",
  before: "变更前",
  after: "变更后",
  retrieval: "检索参数",
  aclVersion: "ACL 版本",
  documentIds: "文档",
  knowledgeBaseId: "知识库",
  ragflowDatasetId: "数据集",
  ragflowDocumentId: "RAGFlow 文档",
  embeddingModel: "Embedding",
  ownerId: "创建者",
  ownerDepartmentId: "归属部门",
  localCleanup: "本地清理",
  remoteCleanup: "RAGFlow 清理",
  aclMode: "权限模式",
  role: "角色",
  status: "状态",
  departmentId: "部门",
  topK: "Top K",
  similarityThreshold: "相似度阈值",
  vectorWeight: "向量权重",
  documentsWithExceptions: "设置过文档级权限的文档",
  totalExceptions: "文档级权限总数",
  exceptionsPerDocument: "每篇文档权限数",
  retrievalTopK: "检索 Top K",
  retrievalSimilarityThreshold: "检索相似度阈值",
  retrievalVectorWeight: "检索向量权重",
};

const valueLabels: Record<string, Record<string, string>> = {
  role: { ...roleLabels },
  status: { active: "启用", disabled: "停用" },
  aclMode: { inherit: "继承知识库权限", restricted: "仅限独立授权" },
  permission: { read: "允许", deny: "禁止" },
  type: { user: "用户", group: "部门" },
  localCleanup: { pending: "待清理", done: "已清理", failed: "失败" },
  remoteCleanup: { pending: "待清理", done: "已清理", failed: "失败" },
};

interface AclAuditEntry {
  type: "user" | "group";
  id: string;
  permission: "read" | "deny";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAclAuditEntry(value: unknown): value is AclAuditEntry {
  return (
    isRecord(value) &&
    (value.type === "user" || value.type === "group") &&
    typeof value.id === "string" &&
    (value.permission === "read" || value.permission === "deny")
  );
}

function asAclEntries(value: unknown, key?: string): AclAuditEntry[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  if (value.length === 0) {
    return key === "before" || key === "after" ? [] : null;
  }
  return value.every(isAclAuditEntry) ? value : null;
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function resolveSubjectName(
  subjectName: (subject: { type: "user" | "group"; id: string }) => string,
  type: "user" | "group",
  id: string,
): string {
  const name = subjectName({ type, id });
  return name === "未知用户" || name === "未知部门" ? id : name;
}

function formatValue(
  key: string,
  value: unknown,
  subjectName: (subject: { type: "user" | "group"; id: string }) => string,
): string {
  if (typeof value === "string") {
    if (key === "departmentId" || key === "ownerDepartmentId") {
      return value ? resolveSubjectName(subjectName, "group", value) : "未分配";
    }
    if (key === "ownerId") {
      return resolveSubjectName(subjectName, "user", value);
    }
    return valueLabels[key]?.[value] ?? value;
  }
  if (Array.isArray(value)) {
    if (key === "documentIds") {
      return `${value.length} 篇`;
    }
    if (key === "changes") {
      return value.map((item) => metadataLabels[String(item)] ?? String(item)).join("、");
    }
    return value.map(formatScalar).join("、");
  }
  return formatScalar(value);
}

function formatAuditTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const now = new Date();
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${time}`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function toAuditEntry(log: AuditLogSummary): AuditLogEntry {
  return {
    id: log.id,
    at: log.createdAt,
    atLabel: formatAuditTime(log.createdAt),
    actorId: log.actorId ?? "",
    actorName: log.actorName ?? "未知操作者",
    action: log.action as AuditAction,
    resourceType: log.resourceType as AuditLogEntry["resourceType"],
    resourceId: log.resourceId ?? "",
    resourceLabel: log.resourceLabel ?? "—",
    result: log.result,
    summary: log.summary,
    metadata: Object.entries(log.metadata ?? {})
      .filter(([key]) => key !== "actorId" && key !== "result")
      .map(([key, value]) => ({ key, label: metadataLabels[key] ?? key, value })),
  };
}

function actionLabelOf(action: string): string {
  return (auditActionLabels as Record<string, string>)[action] ?? action;
}

function resourceLabelOf(resourceType: string): string {
  return (auditResourceLabels as Record<string, string>)[resourceType] ?? resourceType;
}

const resultTones: Record<AuditResult, "success" | "warning" | "danger"> = {
  success: "success",
  denied: "warning",
  failed: "danger",
};

const resultBannerTones: Record<AuditResult, "accent" | "warning" | "danger"> = {
  success: "accent",
  denied: "warning",
  failed: "danger",
};

export function AuditPage() {
  const { logout } = useAuth();
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<"all" | AuditAction>("all");
  const [resultFilter, setResultFilter] = useState<"all" | AuditResult>("all");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);

  const reload = useCallback(async () => {
    setStatus((current) => (current === "ready" ? "ready" : "loading"));
    setLoadError(null);
    try {
      const response = await fetchAuditLogs({
        page,
        pageSize,
        action: actionFilter === "all" ? undefined : actionFilter,
        result: resultFilter === "all" ? undefined : resultFilter,
      });
      setAuditLogs(response.logs.map(toAuditEntry));
      setTotal(response.pagination.total);
      setStatus("ready");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await logout();
      }
      setLoadError(apiErrorMessage(cause));
      setStatus("error");
    }
  }, [actionFilter, logout, page, pageSize, resultFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pagination: PaginationMeta = useMemo(() => {
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    return {
      page,
      pageSize,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };
  }, [page, pageSize, total]);

  const normalized = query.trim().toLowerCase();
  const filteredLogs = useMemo(
    () =>
      auditLogs.filter((log) => {
        if (
          normalized &&
          !log.resourceLabel.toLowerCase().includes(normalized) &&
          !log.summary.toLowerCase().includes(normalized) &&
          !(log.actorName?.toLowerCase().includes(normalized) ?? false)
        ) {
          return false;
        }
        if (actionFilter !== "all" && log.action !== actionFilter) {
          return false;
        }
        if (resultFilter !== "all" && log.result !== resultFilter) {
          return false;
        }
        return true;
      }),
    [auditLogs, normalized, actionFilter, resultFilter],
  );

  const todaysEvents = auditLogs.filter(
    (log) => log.atLabel.startsWith("今天") || log.atLabel === "刚刚",
  ).length;
  const permissionChanges = auditLogs.filter(
    (log) =>
      log.action === "document.acl.update" || log.action === "knowledge_base.default_access.update",
  ).length;
  const issues = auditLogs.filter((log) => log.result !== "success").length;
  const actors = new Set(auditLogs.map((log) => log.actorId)).size;
  const hasFilters = query.trim().length > 0 || actionFilter !== "all" || resultFilter !== "all";
  const selectedLog = auditLogs.find((log) => log.id === selectedLogId);

  function clearFilters() {
    setQuery("");
    setActionFilter("all");
    setResultFilter("all");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audit"
        title="审计日志"
        description="记录权限、知识库、文档与成员管理的变更，数据来自服务端 audit_logs。"
        actions={
          <Badge tone="outline">
            <Icon name="lock" size={11} />
            只读
          </Badge>
        }
      />

      <StatStrip
        items={[
          { label: "今日事件", value: todaysEvents, hint: "当前页" },
          { label: "权限变更", value: permissionChanges, hint: "当前页" },
          {
            label: "失败 / 拒绝",
            value: issues,
            hint: "当前页需关注",
            tone: issues > 0 ? "danger" : "default",
          },
          { label: "操作者", value: actors, hint: "当前页去重" },
        ]}
      />

      {status === "loading" ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-6 text-sm text-muted">
          正在加载审计日志…
        </div>
      ) : null}
      {status === "error" ? (
        <div className="rounded-xl border border-danger/30 bg-danger-soft/40 px-4 py-4">
          <p className="text-sm text-fg">审计日志加载失败：{loadError}</p>
          <Button className="mt-2" size="sm" variant="secondary" onClick={() => void reload()}>
            重试
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onChange={(value) => {
            setQuery(value);
            setSelectedLogId(null);
          }}
          placeholder="搜索当前页操作者、资源或摘要"
          label="搜索审计日志"
        />
        <div className="w-full sm:w-52">
          <label htmlFor="audit-action" className="sr-only">
            按操作筛选
          </label>
          <select
            id="audit-action"
            value={actionFilter}
            onChange={(event) => {
              setActionFilter(event.target.value as "all" | AuditAction);
              setSelectedLogId(null);
              setPage(1);
            }}
            className="h-10 w-full cursor-pointer rounded-lg border border-border bg-surface px-2.5 text-sm text-fg focus:border-accent sm:h-9"
          >
            <option value="all">全部操作</option>
            {(Object.entries(auditActionLabels) as Array<[AuditAction, string]>).map(
              ([action, label]) => (
                <option key={action} value={action}>
                  {label}
                </option>
              ),
            )}
          </select>
        </div>
        <div className="w-full sm:w-36">
          <label htmlFor="audit-result" className="sr-only">
            按结果筛选
          </label>
          <select
            id="audit-result"
            value={resultFilter}
            onChange={(event) => {
              setResultFilter(event.target.value as "all" | AuditResult);
              setSelectedLogId(null);
              setPage(1);
            }}
            className="h-10 w-full cursor-pointer rounded-lg border border-border bg-surface px-2.5 text-sm text-fg focus:border-accent sm:h-9"
          >
            <option value="all">全部结果</option>
            {(Object.entries(auditResultLabels) as Array<[AuditResult, string]>).map(
              ([result, label]) => (
                <option key={result} value={result}>
                  {label}
                </option>
              ),
            )}
          </select>
        </div>
        {hasFilters ? (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            清除筛选
          </Button>
        ) : null}
      </div>

      {filteredLogs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon="clipboard"
            title="没有匹配的审计事件"
            description="调整搜索、操作或结果筛选后再试。"
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  清除筛选
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="hidden xl:block">
            <TableShell
              minWidth={820}
              footer={
                <>
                  <span>当前页 {filteredLogs.length} 条</span>
                  <span>按时间倒序</span>
                </>
              }
            >
              <thead>
                <tr>
                  <th className={thClass}>时间</th>
                  <th className={thClass}>操作者</th>
                  <th className={thClass}>操作</th>
                  <th className={thClass}>资源</th>
                  <th className={thClass}>结果</th>
                  <th className={thClass}>
                    <span className="sr-only">详情</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <AuditRow key={log.id} log={log} onOpen={() => setSelectedLogId(log.id)} />
                ))}
              </tbody>
            </TableShell>
          </div>

          <ul className="space-y-2 xl:hidden">
            {filteredLogs.map((log) => (
              <AuditCard key={log.id} log={log} onOpen={() => setSelectedLogId(log.id)} />
            ))}
          </ul>

          <Pagination
            pagination={pagination}
            onPageChange={(next) => {
              setPage(next);
              setSelectedLogId(null);
            }}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
              setSelectedLogId(null);
            }}
          />
        </>
      )}

      {selectedLog ? (
        <AuditDrawer log={selectedLog} onClose={() => setSelectedLogId(null)} />
      ) : null}
    </div>
  );
}

function AuditRow({ log, onOpen }: { log: AuditLogEntry; onOpen: () => void }) {
  return (
    <tr className={trClass}>
      <td className={tdClass}>
        <p className="text-xs text-muted">{log.atLabel}</p>
      </td>
      <td className={tdClass}>
        <p className="text-sm text-fg">{log.actorName ?? "未知操作者"}</p>
        <p className="mt-0.5 text-[11px] text-subtle">本地账号</p>
      </td>
      <td className={tdClass}>
        <p className="text-sm text-fg">{actionLabelOf(log.action)}</p>
        <p className="mt-0.5 font-mono text-[10px] text-subtle">{log.action}</p>
      </td>
      <td className={tdClass}>
        <p className="max-w-[260px] truncate text-sm text-fg">{log.resourceLabel}</p>
        <p className="mt-0.5 text-[11px] text-subtle">{resourceLabelOf(log.resourceType)}</p>
      </td>
      <td className={tdClass}>
        <Badge tone={resultTones[log.result]}>{auditResultLabels[log.result]}</Badge>
      </td>
      <td className={`${tdClass} text-right`}>
        <Button size="sm" variant="secondary" onClick={onOpen}>
          查看
        </Button>
      </td>
    </tr>
  );
}

function AuditCard({ log, onOpen }: { log: AuditLogEntry; onOpen: () => void }) {
  return (
    <li className="rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-subtle">
          <Icon name="clipboard" size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg">{actionLabelOf(log.action)}</p>
          <p className="mt-0.5 truncate text-[11px] text-subtle">{log.resourceLabel}</p>
        </div>
        <Badge tone={resultTones[log.result]}>{auditResultLabels[log.result]}</Badge>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-muted">{log.summary}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
        <span>{log.atLabel}</span>
        <span>{log.actorName ?? "未知操作者"}</span>
        <span>{resourceLabelOf(log.resourceType)}</span>
      </div>
      <div className="mt-3">
        <Button size="sm" variant="secondary" onClick={onOpen}>
          查看详情
        </Button>
      </div>
    </li>
  );
}

function AclEntries({
  entries,
  subjectName,
  emptyLabel,
}: {
  entries: AclAuditEntry[];
  subjectName: (subject: { type: "user" | "group"; id: string }) => string;
  emptyLabel: string;
}) {
  if (entries.length === 0) {
    return <p className="text-xs leading-5 text-subtle">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {entries.map((entry) => (
        <li
          key={`${entry.type}:${entry.id}:${entry.permission}`}
          className="flex items-start justify-between gap-2"
        >
          <span className="min-w-0 break-all text-xs leading-5 text-fg">
            <span className="text-subtle">{entry.type === "group" ? "部门 · " : "用户 · "}</span>
            {resolveSubjectName(subjectName, entry.type, entry.id)}
          </span>
          <Badge tone={entry.permission === "deny" ? "danger" : "success"}>
            {entry.permission === "deny" ? "禁止" : "允许"}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function MetadataValue({ item, emptyLabel }: { item: AuditMetadataItem; emptyLabel: string }) {
  const { subjectName } = useDirectory();
  const aclEntries = asAclEntries(item.value, item.key);

  if (aclEntries) {
    return <AclEntries entries={aclEntries} subjectName={subjectName} emptyLabel={emptyLabel} />;
  }

  if (isRecord(item.value)) {
    const entries = Object.entries(item.value);
    if (entries.length === 0) {
      return <span className="text-xs text-subtle">—</span>;
    }
    return (
      <dl className="space-y-1.5">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-[11px] text-subtle">{metadataLabels[key] ?? key}</dt>
            <dd className="min-w-0 break-words text-right text-xs leading-5 text-fg">
              {formatValue(key, value, subjectName)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <span className="break-words text-xs leading-5 text-fg">
      {formatValue(item.key ?? "", item.value, subjectName)}
    </span>
  );
}

function MetadataRow({ item, emptyLabel }: { item: AuditMetadataItem; emptyLabel: string }) {
  if (isRecord(item.value)) {
    return (
      <div className="px-3 py-2.5">
        <dt className="text-[11px] text-subtle">{item.label}</dt>
        <dd className="mt-1.5">
          <MetadataValue item={item} emptyLabel={emptyLabel} />
        </dd>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <dt className="shrink-0 text-[11px] text-subtle">{item.label}</dt>
      <dd className="min-w-0 max-w-[280px] text-right">
        <MetadataValue item={item} emptyLabel={emptyLabel} />
      </dd>
    </div>
  );
}

function ChangeComparison({
  before,
  after,
  emptyLabel,
}: {
  before?: AuditMetadataItem;
  after?: AuditMetadataItem;
  emptyLabel: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-surface-2/50 p-3">
        <p className="text-[11px] font-medium text-subtle">变更前</p>
        <div className="mt-2">
          {before ? (
            <MetadataValue item={before} emptyLabel={emptyLabel} />
          ) : (
            <span className="text-xs text-subtle">—</span>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-accent/30 bg-accent-soft/30 p-3">
        <p className="text-[11px] font-medium text-accent">变更后</p>
        <div className="mt-2">
          {after ? (
            <MetadataValue item={after} emptyLabel={emptyLabel} />
          ) : (
            <span className="text-xs text-subtle">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

function AuditDrawer({ log, onClose }: { log: AuditLogEntry; onClose: () => void }) {
  const before = log.metadata.find((item) => item.key === "before");
  const after = log.metadata.find((item) => item.key === "after");
  const otherMetadata = log.metadata.filter(
    (item) => item.key !== "before" && item.key !== "after",
  );
  const emptyLabel =
    log.action === "document.acl.update"
      ? "无（未设置文档级权限）"
      : log.action === "knowledge_base.acl.update"
        ? "无（未设置访问范围）"
        : "无";

  return (
    <Drawer
      open
      onClose={onClose}
      title={actionLabelOf(log.action)}
      description={`${log.atLabel} · ${log.actorName ?? "未知操作者"}`}
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
        </div>
      }
    >
      <InfoBanner
        tone={resultBannerTones[log.result]}
        icon={
          log.result === "success"
            ? "check-circle"
            : log.result === "denied"
              ? "ban"
              : "alert-circle"
        }
        title={`结果：${auditResultLabels[log.result]}`}
      >
        {log.summary}
      </InfoBanner>

      <section className="mt-4">
        <h3 className="text-xs font-medium text-fg">资源</h3>
        <div className="mt-2 rounded-xl border border-border bg-surface-2/60 p-3">
          <p className="text-sm font-medium text-fg">{log.resourceLabel}</p>
          <p className="mt-1 text-[11px] text-subtle">
            {resourceLabelOf(log.resourceType)} · {log.resourceId}
          </p>
        </div>
      </section>

      <section className="mt-4">
        <h3 className="text-xs font-medium text-fg">操作者</h3>
        <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-fg">
            {log.actorName?.slice(0, 1) ?? "?"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-fg">{log.actorName ?? "未知操作者"}</p>
            <p className="mt-0.5 truncate text-[11px] text-subtle">本地账号</p>
          </div>
        </div>
      </section>

      {log.metadata.length > 0 ? (
        <section className="mt-4 space-y-2">
          <h3 className="text-xs font-medium text-fg">详情</h3>
          {before || after ? (
            <ChangeComparison before={before} after={after} emptyLabel={emptyLabel} />
          ) : null}
          {otherMetadata.length > 0 ? (
            <dl className="divide-y divide-border rounded-xl border border-border bg-surface">
              {otherMetadata.map((item) => (
                <MetadataRow key={item.key ?? item.label} item={item} emptyLabel={emptyLabel} />
              ))}
            </dl>
          ) : null}
        </section>
      ) : null}

      <section className="mt-4">
        <h3 className="text-xs font-medium text-fg">事件信息</h3>
        <dl className="mt-2 grid gap-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-subtle">时间</dt>
            <dd className="text-fg">{log.atLabel}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-subtle">操作</dt>
            <dd className="font-mono text-[11px] text-fg">{log.action}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-subtle">事件 ID</dt>
            <dd className="font-mono text-[11px] text-fg">{log.id}</dd>
          </div>
        </dl>
      </section>
    </Drawer>
  );
}
