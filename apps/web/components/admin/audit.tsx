"use client";

import { useMemo, useState } from "react";
import {
  type AuditAction,
  type AuditLogEntry,
  type AuditResult,
  auditActionLabels,
  auditResourceLabels,
  auditResultLabels,
  findUser,
  roleLabels,
} from "@/lib/admin-data";
import { Icon } from "../icons";
import { useAdminData } from "./admin-data";
import { Drawer } from "./drawer";
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
  const { auditLogs } = useAdminData();
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<"all" | AuditAction>("all");
  const [resultFilter, setResultFilter] = useState<"all" | AuditResult>("all");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const normalized = query.trim().toLowerCase();
  const filteredLogs = useMemo(
    () =>
      auditLogs.filter((log) => {
        const actor = findUser(log.actorId);
        if (
          normalized &&
          !log.resourceLabel.toLowerCase().includes(normalized) &&
          !log.summary.toLowerCase().includes(normalized) &&
          !(actor?.name.toLowerCase().includes(normalized) ?? false)
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
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audit"
        title="审计日志"
        description="记录权限、知识库与文档管理的变更。当前展示静态示例数据，审计查询 API 将在下一冲刺接入。"
        actions={
          <Badge tone="outline">
            <Icon name="lock" size={11} />
            只读示例
          </Badge>
        }
      />

      <StatStrip
        items={[
          { label: "今日事件", value: todaysEvents, hint: "含刚刚发生" },
          { label: "权限变更", value: permissionChanges, hint: "ACL 与默认范围" },
          {
            label: "失败 / 拒绝",
            value: issues,
            hint: "需要关注",
            tone: issues > 0 ? "danger" : "default",
          },
          { label: "操作者", value: actors, hint: "去重" },
        ]}
      />

      <InfoBanner tone="neutral" icon="clipboard" title="静态示例审计流">
        当前事件为静态示例，不代表本轮 ACL 操作已被记录。服务端已在本轮写入 audit_logs；审计查询 API
        与审计页接真将在下一冲刺完成。
      </InfoBanner>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onChange={(value) => {
            setQuery(value);
            setSelectedLogId(null);
          }}
          placeholder="搜索操作者、资源或摘要"
          label="搜索审计日志"
        />
        <div className="w-full sm:w-52">
          <label htmlFor="audit-action" className="sr-only">
            按操作筛选
          </label>
          <select
            id="audit-action"
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value as "all" | AuditAction)}
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
            onChange={(event) => setResultFilter(event.target.value as "all" | AuditResult)}
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
                  <span>共 {filteredLogs.length} 条事件</span>
                  <span>按时间倒序 · 只读</span>
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
        </>
      )}

      {selectedLog ? (
        <AuditDrawer log={selectedLog} onClose={() => setSelectedLogId(null)} />
      ) : null}
    </div>
  );
}

function AuditRow({ log, onOpen }: { log: AuditLogEntry; onOpen: () => void }) {
  const actor = findUser(log.actorId);
  return (
    <tr className={trClass}>
      <td className={tdClass}>
        <p className="text-xs text-muted">{log.atLabel}</p>
      </td>
      <td className={tdClass}>
        <p className="text-sm text-fg">{actor?.name ?? "未知操作者"}</p>
        <p className="mt-0.5 text-[11px] text-subtle">{actor ? roleLabels[actor.role] : "—"}</p>
      </td>
      <td className={tdClass}>
        <p className="text-sm text-fg">{auditActionLabels[log.action]}</p>
        <p className="mt-0.5 font-mono text-[10px] text-subtle">{log.action}</p>
      </td>
      <td className={tdClass}>
        <p className="max-w-[260px] truncate text-sm text-fg">{log.resourceLabel}</p>
        <p className="mt-0.5 text-[11px] text-subtle">{auditResourceLabels[log.resourceType]}</p>
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
  const actor = findUser(log.actorId);
  return (
    <li className="rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-subtle">
          <Icon name="clipboard" size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg">{auditActionLabels[log.action]}</p>
          <p className="mt-0.5 truncate text-[11px] text-subtle">{log.resourceLabel}</p>
        </div>
        <Badge tone={resultTones[log.result]}>{auditResultLabels[log.result]}</Badge>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-muted">{log.summary}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
        <span>{log.atLabel}</span>
        <span>{actor?.name ?? "未知操作者"}</span>
        <span>{auditResourceLabels[log.resourceType]}</span>
      </div>
      <div className="mt-3">
        <Button size="sm" variant="secondary" onClick={onOpen}>
          查看详情
        </Button>
      </div>
    </li>
  );
}

function AuditDrawer({ log, onClose }: { log: AuditLogEntry; onClose: () => void }) {
  const actor = findUser(log.actorId);
  return (
    <Drawer
      open
      onClose={onClose}
      title={auditActionLabels[log.action]}
      description={`${log.atLabel} · ${actor?.name ?? "未知操作者"}`}
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
            {auditResourceLabels[log.resourceType]} · {log.resourceId}
          </p>
        </div>
      </section>

      <section className="mt-4">
        <h3 className="text-xs font-medium text-fg">操作者</h3>
        <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-fg">
            {actor?.name.slice(0, 1) ?? "?"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-fg">{actor?.name ?? "未知操作者"}</p>
            <p className="mt-0.5 truncate text-[11px] text-subtle">
              {actor?.email ?? "—"} · {actor ? roleLabels[actor.role] : "—"}
            </p>
          </div>
        </div>
      </section>

      {log.metadata.length > 0 ? (
        <section className="mt-4">
          <h3 className="text-xs font-medium text-fg">详情</h3>
          <dl className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface">
            {log.metadata.map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-3 px-3 py-2">
                <dt className="text-[11px] text-subtle">{item.label}</dt>
                <dd className="max-w-[280px] text-right text-xs text-fg">{item.value}</dd>
              </div>
            ))}
          </dl>
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

      <div className="mt-4">
        <InfoBanner tone="neutral" icon="lock" title="只读示例">
          审计事件不可在这里修改。服务端已写入 audit_logs；查询 API 与页面接真将在下一冲刺完成。
        </InfoBanner>
      </div>
    </Drawer>
  );
}
