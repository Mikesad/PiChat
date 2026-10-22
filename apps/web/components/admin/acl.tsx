"use client";

import type { AccessCheckResponse } from "@pichat/shared";
import { useEffect, useState } from "react";
import {
  type AclException,
  type AclPermission,
  type AclSubject,
  findDocument,
  groupMemberCount,
  groups,
  mergeException,
  removeException,
  roleLabels,
  subjectKey,
  subjectMemberCount,
  subjectName,
  users,
} from "@/lib/admin-data";
import { apiErrorMessage, checkDocumentAccess } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAuth } from "../auth/auth-provider";
import { Icon } from "../icons";
import { useAdminData } from "./admin-data";
import { Drawer } from "./drawer";
import { useToast } from "./toast";
import { Badge, Button, InfoBanner, StatusBadge, selectClass } from "./ui";
import { useApiErrorHandler } from "./use-api-error";

const activeUsers = users.filter((user) => user.status === "active");

function parseSubject(value: string): AclSubject | null {
  const [type, id] = value.split(":");
  if ((type === "user" || type === "group") && id) {
    return { type, id };
  }
  return null;
}

export function SubjectSelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      className={selectClass}
    >
      <option value="">选择用户或用户组…</option>
      <optgroup label="用户组">
        {groups.map((group) => (
          <option key={group.id} value={`group:${group.id}`}>
            {group.name} · {groupMemberCount(group.id)} 人
          </option>
        ))}
      </optgroup>
      <optgroup label="用户">
        {activeUsers.map((user) => (
          <option key={user.id} value={`user:${user.id}`}>
            {user.name} · {roleLabels[user.role]}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

export function PermissionSelect({
  value,
  onChange,
  label,
}: {
  value: AclPermission;
  onChange: (value: AclPermission) => void;
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as AclPermission)}
      aria-label={label}
      className={selectClass}
    >
      <option value="read">读取</option>
      <option value="deny">拒绝</option>
    </select>
  );
}

function diffExceptions(original: AclException[], draft: AclException[]) {
  const added = draft.filter(
    (exception) => !original.some((item) => subjectKey(item) === subjectKey(exception)),
  ).length;
  const removed = original.filter(
    (exception) => !draft.some((item) => subjectKey(item) === subjectKey(exception)),
  ).length;
  const changed = draft.filter((exception) =>
    original.some(
      (item) =>
        subjectKey(item) === subjectKey(exception) && item.permission !== exception.permission,
    ),
  ).length;
  return { added, removed, changed, total: added + removed + changed };
}

export function DocumentAclDrawer({
  documentId,
  onClose,
}: {
  documentId: string;
  onClose: () => void;
}) {
  const { knowledgeBases, setDocumentExceptions } = useAdminData();
  const { user } = useAuth();
  const { showToast } = useToast();
  const handleApiError = useApiErrorHandler();
  const found = findDocument(knowledgeBases, documentId);
  const [exceptions, setExceptions] = useState<AclException[]>(
    () => found?.document.exceptions ?? [],
  );
  const [subjectValue, setSubjectValue] = useState("");
  const [permission, setPermission] = useState<AclPermission>("read");
  const [error, setError] = useState<string | null>(null);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accessCheck, setAccessCheck] = useState<{
    status: "loading" | "ready" | "error";
    result?: AccessCheckResponse;
    error?: string;
  }>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setAccessCheck({ status: "loading" });

    checkDocumentAccess(documentId)
      .then((result) => {
        if (active) {
          setAccessCheck({ status: "ready", result });
        }
      })
      .catch((cause) => {
        if (active) {
          setAccessCheck({ status: "error", error: apiErrorMessage(cause) });
        }
      });

    return () => {
      active = false;
    };
  }, [documentId]);

  if (!found) {
    return null;
  }

  const { knowledgeBase, document } = found;
  const diff = diffExceptions(document.exceptions, exceptions);
  const dirty = diff.total > 0;
  const draftDenyCount = exceptions.filter((exception) => exception.permission === "deny").length;
  const pendingSubject = parseSubject(subjectValue);
  const subjectInDefault = pendingSubject
    ? knowledgeBase.defaultSubjects.some(
        (subject) => subjectKey(subject) === subjectKey(pendingSubject),
      )
    : false;

  function requestClose() {
    if (!dirty || discardPrompt) {
      onClose();
      return;
    }
    setDiscardPrompt(true);
  }

  function handleAdd() {
    if (!pendingSubject) {
      setError("请选择用户或用户组");
      return;
    }
    setExceptions((previous) => mergeException(previous, { ...pendingSubject, permission }));
    setSubjectValue("");
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await setDocumentExceptions(knowledgeBase.id, document.id, exceptions);
      showToast("权限已更新，下一次提问生效");
      onClose();
    } catch (cause) {
      await handleApiError(cause);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open
      onClose={requestClose}
      width="lg"
      title={document.title}
      description={`${knowledgeBase.name} · ${document.sizeLabel ?? "—"} · 权限变更将在下一次提问时生效`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-subtle">
            {diff.total > 0
              ? `将新增 ${diff.added} 项、移除 ${diff.removed} 项、修改 ${diff.changed} 项`
              : "没有未保存的更改"}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={requestClose}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={diff.total === 0 || saving}>
              {saving ? "保存中…" : `保存${diff.total > 0 ? ` ${diff.total} 项更改` : ""}`}
            </Button>
          </div>
        </div>
      }
    >
      {discardPrompt ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/30 bg-danger-soft p-3">
          <p className="text-xs text-fg">有未保存的权限更改，确定放弃？</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setDiscardPrompt(false)}>
              继续编辑
            </Button>
            <Button size="sm" variant="danger" onClick={onClose}>
              放弃更改
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-surface-2/60 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={document.status} />
          <Badge tone="neutral">{knowledgeBase.name}</Badge>
        </div>
        <p className="mt-2.5 text-sm font-medium text-fg">
          服务端有效人数：{document.effectiveReaderCount} 人可读
        </p>
        <p className="mt-1 text-xs leading-5 text-subtle">
          {document.exceptions.length} 条已保存例外 · 草稿 {exceptions.length} 条
          {diff.total > 0 ? "（尚未保存，人数不会变化）" : ""}
        </p>
      </div>

      <div className="mt-3">
        <InfoBanner tone="accent" icon="shield-check" title="固定规则">
          知识库默认范围对全部文档生效，文档例外叠加在其上；任何拒绝规则都会覆盖读取权限。
        </InfoBanner>
      </div>

      <section className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium text-fg">继承自知识库默认</h3>
          <Badge tone="outline">{knowledgeBase.defaultSubjects.length}</Badge>
        </div>
        <p className="mt-1 text-[11px] text-subtle">
          默认范围在知识库的「访问范围」中调整，这里不能单独移除。
        </p>
        {knowledgeBase.defaultSubjects.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-warning/40 bg-warning-soft px-3 py-2 text-xs leading-5 text-warning">
            该知识库没有默认访问范围，普通成员只有在文档例外中才会获得读取权限。
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {knowledgeBase.defaultSubjects.map((subject) => (
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
                <Badge tone="neutral">继承</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium text-fg">文档例外</h3>
          <Badge tone={draftDenyCount > 0 ? "danger" : "outline"}>{exceptions.length} 条</Badge>
        </div>
        {exceptions.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-subtle">
            暂无文档例外。文档当前只继承知识库默认范围。
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {exceptions.map((exception) => {
              const inherited = knowledgeBase.defaultSubjects.some(
                (subject) => subjectKey(subject) === subjectKey(exception),
              );
              return (
                <li
                  key={subjectKey(exception)}
                  className={cn(
                    "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2",
                    exception.permission === "deny"
                      ? "border-danger/30 bg-danger-soft/60"
                      : "border-border bg-surface",
                  )}
                >
                  <Icon
                    name={exception.type === "group" ? "users" : "user"}
                    size={14}
                    className={cn(
                      "shrink-0",
                      exception.permission === "deny" ? "text-danger" : "text-subtle",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {subjectName(exception)}
                  </span>
                  <span className="shrink-0 text-[11px] text-subtle">
                    {subjectMemberCount(exception)} 人
                  </span>
                  <Badge tone={exception.permission === "deny" ? "danger" : "success"}>
                    {exception.permission === "deny" ? "拒绝" : "读取"}
                  </Badge>
                  {inherited && exception.permission === "deny" ? (
                    <Badge tone="danger">覆盖默认</Badge>
                  ) : null}
                  {inherited && exception.permission === "read" ? (
                    <Badge tone="warning">与默认重复</Badge>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      setExceptions((previous) => removeException(previous, exception))
                    }
                    aria-label={`移除 ${subjectName(exception)} 的文档例外`}
                    className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-danger"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3 rounded-xl border border-border bg-surface-2/50 p-3">
          <p className="text-xs font-medium text-fg">添加文档例外</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_auto]">
            <SubjectSelect
              value={subjectValue}
              onChange={(value) => {
                setSubjectValue(value);
                setError(null);
              }}
              label="选择要添加的用户或用户组"
            />
            <PermissionSelect value={permission} onChange={setPermission} label="选择权限" />
            <Button onClick={handleAdd} className="justify-center">
              <Icon name="plus" size={14} />
              添加
            </Button>
          </div>
          {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
          {pendingSubject && subjectInDefault && permission === "read" ? (
            <p className="mt-1 text-[11px] leading-5 text-warning">
              该主体已通过知识库默认获得读取权限，这条例外不会扩大范围。
            </p>
          ) : null}
          {pendingSubject && subjectMemberCount(pendingSubject) === 0 && permission === "deny" ? (
            <p className="mt-1 text-[11px] leading-5 text-warning">
              该用户组当前没有成员，拒绝规则暂时不会影响任何人。
            </p>
          ) : null}
          <p className="mt-1 text-[11px] leading-5 text-subtle">
            拒绝优先于读取；同一主体只能保留一条文档例外。
          </p>
        </div>
      </section>

      <section className="mt-5">
        <h3 className="text-xs font-medium text-fg">访问检查</h3>
        <p className="mt-1 text-[11px] leading-5 text-subtle">
          服务端只判定当前登录用户，基于已保存的权限。前端不能指定其他用户，也不能伪造服务端结果。
        </p>
        <div className="mt-2" role="status" aria-live="polite">
          {accessCheck.status === "loading" ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-subtle">
              正在请求服务端判定…
            </p>
          ) : null}
          {accessCheck.status === "error" ? (
            <InfoBanner tone="danger" icon="alert-circle" title="访问检查失败">
              {accessCheck.error ?? "请稍后重试。"}
            </InfoBanner>
          ) : null}
          {accessCheck.status === "ready" && accessCheck.result ? (
            <AccessCheckResult
              result={accessCheck.result}
              userName={user?.displayName ?? "当前用户"}
            />
          ) : null}
          {diff.total > 0 ? (
            <p className="mt-1 text-[11px] leading-5 text-warning">
              草稿尚未保存，以上服务端判定不包含本次更改。
            </p>
          ) : null}
        </div>
      </section>
    </Drawer>
  );
}

function AccessCheckResult({
  result,
  userName,
}: {
  result: AccessCheckResponse;
  userName: string;
}) {
  if (result.reason === "role_override") {
    return (
      <InfoBanner tone="accent" icon="shield-check" title="允许 · 角色覆盖">
        {userName} 的角色始终可读该文档。服务端有效读者 {result.effectiveReaderCount} 人。
      </InfoBanner>
    );
  }
  if (result.reason === "explicit_deny") {
    return (
      <InfoBanner tone="danger" icon="ban" title="拒绝 · 命中拒绝规则">
        拒绝优先于知识库默认和读取例外。服务端有效读者 {result.effectiveReaderCount} 人。
      </InfoBanner>
    );
  }
  if (result.reason === "allowed") {
    return (
      <InfoBanner tone="accent" icon="check-circle" title="允许">
        来源为知识库默认范围或文档读取例外。服务端有效读者 {result.effectiveReaderCount} 人。
      </InfoBanner>
    );
  }
  return (
    <InfoBanner tone="neutral" icon="lock" title="拒绝 · 无授权">
      {userName} 不属于任何允许主体，因此无法读取该文档。服务端有效读者{" "}
      {result.effectiveReaderCount} 人。
    </InfoBanner>
  );
}

export function BulkAclDrawer({
  knowledgeBaseId,
  documentIds,
  onClose,
  onApplied,
}: {
  knowledgeBaseId: string;
  documentIds: string[];
  onClose: () => void;
  onApplied?: () => void;
}) {
  const { knowledgeBases, setBatchDocumentExceptions } = useAdminData();
  const { showToast } = useToast();
  const handleApiError = useApiErrorHandler();
  const targets = documentIds.flatMap((documentId) => {
    const found = findDocument(knowledgeBases, documentId);
    return found && found.knowledgeBase.id === knowledgeBaseId ? [found] : [];
  });
  const sharedSignature =
    targets.length > 0 ? exceptionSignature(targets[0]?.document.exceptions ?? []) : "";
  const hasSharedExceptions =
    targets.length > 0 &&
    targets.every((target) => exceptionSignature(target.document.exceptions) === sharedSignature);
  const knowledgeBase = targets[0]?.knowledgeBase;

  const [exceptions, setExceptions] = useState<AclException[]>(() =>
    hasSharedExceptions ? (targets[0]?.document.exceptions ?? []) : [],
  );
  const [subjectValue, setSubjectValue] = useState("");
  const [permission, setPermission] = useState<AclPermission>("read");
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pendingSubject = parseSubject(subjectValue);
  const denyCount = exceptions.filter((exception) => exception.permission === "deny").length;
  const existingExceptionCount = targets.reduce(
    (sum, target) => sum + target.document.exceptions.length,
    0,
  );

  function handleAdd() {
    if (!pendingSubject) {
      setError("请选择用户或用户组");
      return;
    }
    setExceptions((previous) => mergeException(previous, { ...pendingSubject, permission }));
    setSubjectValue("");
    setError(null);
  }

  async function handleApply() {
    if (targets.length !== documentIds.length || !knowledgeBase) {
      setSubmitError("选中的文档必须属于同一个知识库，请重新选择");
      return;
    }

    setSaving(true);
    setSubmitError(null);
    try {
      await setBatchDocumentExceptions(knowledgeBaseId, documentIds, exceptions);
      showToast(`已更新 ${documentIds.length} 篇文档的权限，下一次提问生效`);
      onApplied?.();
      onClose();
    } catch (cause) {
      setSubmitError(apiErrorMessage(cause));
      await handleApiError(cause);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title="批量设置文档权限"
      description={`将整体替换选中的 ${documentIds.length} 篇文档的例外规则`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-subtle">
            {exceptions.length} 条例外 · {denyCount} 条拒绝
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button
              variant={denyCount > 0 ? "danger" : "primary"}
              onClick={() => void handleApply()}
              disabled={saving || targets.length === 0}
            >
              {saving ? "保存中…" : `应用到 ${documentIds.length} 篇`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="rounded-xl border border-border bg-surface-2/60 p-3">
        <p className="text-xs font-medium text-fg">选中的文档</p>
        <ul className="mt-1.5 space-y-1 text-xs text-muted">
          {targets.slice(0, 4).map((target) => (
            <li key={target.document.id} className="truncate">
              · {target.document.title}
            </li>
          ))}
          {targets.length > 4 ? <li>等 {targets.length} 篇文档</li> : null}
        </ul>
      </div>

      {existingExceptionCount > 0 ? (
        <div className="mt-3">
          <InfoBanner tone="warning" icon="alert-circle" title="整体替换，不是追加">
            这些文档当前共有 {existingExceptionCount} 条例外
            {hasSharedExceptions ? "（规则相同，已载入草稿）" : "（规则不一致，草稿从空开始）"}。
            保存后每篇文档只保留下方草稿中的规则；知识库默认访问范围不受影响。
          </InfoBanner>
        </div>
      ) : (
        <div className="mt-3">
          <InfoBanner tone="neutral" icon="info" title="批量例外">
            选中的文档当前没有文档例外。保存后将为每篇文档写入相同的例外规则。
          </InfoBanner>
        </div>
      )}

      <section className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium text-fg">批量例外草稿</h3>
          <Badge tone={denyCount > 0 ? "danger" : "outline"}>{exceptions.length} 条</Badge>
        </div>
        {exceptions.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-subtle">
            草稿为空。保存会清空这些文档的全部文档例外，仅保留知识库默认范围。
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {exceptions.map((exception) => (
              <li
                key={subjectKey(exception)}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2",
                  exception.permission === "deny"
                    ? "border-danger/30 bg-danger-soft/60"
                    : "border-border bg-surface",
                )}
              >
                <Icon
                  name={exception.type === "group" ? "users" : "user"}
                  size={14}
                  className={cn(
                    "shrink-0",
                    exception.permission === "deny" ? "text-danger" : "text-subtle",
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">
                  {subjectName(exception)}
                </span>
                <span className="shrink-0 text-[11px] text-subtle">
                  {subjectMemberCount(exception)} 人
                </span>
                <Badge tone={exception.permission === "deny" ? "danger" : "success"}>
                  {exception.permission === "deny" ? "拒绝" : "读取"}
                </Badge>
                <button
                  type="button"
                  onClick={() => setExceptions((previous) => removeException(previous, exception))}
                  aria-label={`移除 ${subjectName(exception)} 的批量例外`}
                  className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-danger"
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 rounded-xl border border-border bg-surface-2/50 p-3">
          <p className="text-xs font-medium text-fg">添加例外</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_auto]">
            <SubjectSelect
              value={subjectValue}
              onChange={(value) => {
                setSubjectValue(value);
                setError(null);
              }}
              label="选择要批量授权的用户或用户组"
            />
            <PermissionSelect value={permission} onChange={setPermission} label="选择批量权限" />
            <Button onClick={handleAdd} className="justify-center">
              <Icon name="plus" size={14} />
              添加
            </Button>
          </div>
          {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
          <p className="mt-1 text-[11px] leading-5 text-subtle">
            同一主体只能保留一条例外；拒绝优先于读取，保存后下一次提问立即生效。
          </p>
        </div>
      </section>

      {submitError ? (
        <div className="mt-4">
          <InfoBanner tone="danger" icon="alert-circle" title="批量授权失败">
            {submitError}
          </InfoBanner>
        </div>
      ) : null}

      <div className="mt-4">
        <InfoBanner
          tone={denyCount > 0 ? "danger" : "warning"}
          icon="shield-check"
          title="确认影响范围"
        >
          {pendingSubject
            ? `新添加的主体约影响 ${subjectMemberCount(pendingSubject)} 人。`
            : `本次将覆盖 ${documentIds.length} 篇文档。`}
          {knowledgeBase ? ` 知识库「${knowledgeBase.name}」的默认访问范围继续生效。` : ""}
        </InfoBanner>
      </div>
    </Drawer>
  );
}

function exceptionSignature(exceptions: AclException[]): string {
  return JSON.stringify(
    [...exceptions]
      .sort((left, right) => subjectKey(left).localeCompare(subjectKey(right)))
      .map((exception) => [subjectKey(exception), exception.permission]),
  );
}
