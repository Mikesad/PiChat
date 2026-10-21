"use client";

import { useState } from "react";
import {
  type AclException,
  type AclPermission,
  type AclSubject,
  accessCountsFor,
  explainAccessFor,
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
import { cn } from "@/lib/utils";
import { Icon } from "../icons";
import { useAdminData } from "./admin-data";
import { Drawer } from "./drawer";
import { useToast } from "./toast";
import { Badge, Button, InfoBanner, StatusBadge, selectClass } from "./ui";

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
  const { showToast } = useToast();
  const found = findDocument(knowledgeBases, documentId);
  const [exceptions, setExceptions] = useState<AclException[]>(
    () => found?.document.exceptions ?? [],
  );
  const [subjectValue, setSubjectValue] = useState("");
  const [permission, setPermission] = useState<AclPermission>("read");
  const [checkUserId, setCheckUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [discardPrompt, setDiscardPrompt] = useState(false);

  if (!found) {
    return null;
  }

  const { knowledgeBase, document } = found;
  const counts = accessCountsFor(knowledgeBase, document, exceptions);
  const diff = diffExceptions(document.exceptions, exceptions);
  const dirty = diff.total > 0;
  const selectedUser = activeUsers.find((user) => user.id === checkUserId);
  const explanation = selectedUser
    ? explainAccessFor(knowledgeBase, document, selectedUser, exceptions)
    : null;
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

  function handleSave() {
    setDocumentExceptions(knowledgeBase.id, document.id, exceptions);
    showToast("权限已更新，下一次提问生效");
    onClose();
  }

  return (
    <Drawer
      open
      onClose={requestClose}
      width="lg"
      title={document.title}
      description={`${knowledgeBase.name} · ${document.sizeLabel} · 权限变更将在下一次提问时生效`}
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
            <Button onClick={handleSave} disabled={diff.total === 0}>
              保存{diff.total > 0 ? ` ${diff.total} 项更改` : ""}
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
        <p className="mt-2.5 text-sm font-medium text-fg">{counts.allowed.length} 人可读</p>
        <p className="mt-1 text-xs leading-5 text-subtle">
          {counts.denied.length} 人被拒绝 · {counts.exceptionCount} 条文档例外 ·
          租户管理员始终可读， 不计入可见人数
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
          <Badge tone={counts.denyCount > 0 ? "danger" : "outline"}>
            {counts.exceptionCount} 条
          </Badge>
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
        <p className="mt-1 text-[11px] text-subtle">选择一个用户，查看最终判断和原因路径。</p>
        <div className="mt-2">
          <select
            value={checkUserId}
            onChange={(event) => setCheckUserId(event.target.value)}
            aria-label="选择要检查的用户"
            className={selectClass}
          >
            <option value="">选择用户…</option>
            {activeUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {roleLabels[user.role]}
              </option>
            ))}
          </select>
        </div>
        {selectedUser && explanation ? (
          <div className="mt-2" role="status" aria-live="polite">
            <AccessResult
              explanation={explanation}
              userName={selectedUser.name}
              knowledgeBaseName={knowledgeBase.name}
            />
          </div>
        ) : null}
      </section>
    </Drawer>
  );
}

function AccessResult({
  explanation,
  userName,
  knowledgeBaseName,
}: {
  explanation: ReturnType<typeof explainAccessFor>;
  userName: string;
  knowledgeBaseName: string;
}) {
  if (explanation.reason === "role_override") {
    return (
      <InfoBanner tone="accent" icon="shield-check" title="允许 · 角色覆盖">
        {userName} 是租户管理员，始终可读全部文档，不计入可见人数。
      </InfoBanner>
    );
  }
  if (explanation.reason === "explicit_deny") {
    return (
      <InfoBanner tone="danger" icon="ban" title="拒绝">
        命中拒绝规则{explanation.subject ? ` · ${subjectName(explanation.subject)}` : ""}。
        拒绝优先于知识库默认和读取例外。
      </InfoBanner>
    );
  }
  if (explanation.reason === "allowed") {
    const source =
      explanation.source === "document_exception"
        ? "文档例外"
        : `知识库默认 · ${knowledgeBaseName}`;
    return (
      <InfoBanner tone="accent" icon="check-circle" title="允许">
        来源：{source}
        {explanation.subject ? ` · ${subjectName(explanation.subject)}` : ""}。
      </InfoBanner>
    );
  }
  return (
    <InfoBanner tone="neutral" icon="lock" title="无授权">
      {userName} 不属于任何允许主体，因此无法读取该文档。
    </InfoBanner>
  );
}

export function BulkAclDialog({
  documentIds,
  initialPermission,
  onClose,
}: {
  documentIds: string[];
  initialPermission: AclPermission;
  onClose: () => void;
}) {
  const { knowledgeBases, setDocumentExceptions } = useAdminData();
  const { showToast } = useToast();
  const [subjectValue, setSubjectValue] = useState("");
  const [permission, setPermission] = useState<AclPermission>(initialPermission);
  const [error, setError] = useState<string | null>(null);

  const targets = documentIds.flatMap((documentId) => {
    const found = findDocument(knowledgeBases, documentId);
    return found ? [found] : [];
  });
  const subject = parseSubject(subjectValue);

  function handleApply() {
    if (!subject) {
      setError("请选择用户或用户组");
      return;
    }
    const exception: AclException = { ...subject, permission };
    for (const target of targets) {
      setDocumentExceptions(
        target.knowledgeBase.id,
        target.document.id,
        mergeException(target.document.exceptions, exception),
      );
    }
    showToast(`已为 ${targets.length} 篇文档更新权限`);
    onClose();
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="批量设置文档权限"
      description={`将应用到选中的 ${targets.length} 篇文档`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button variant={permission === "deny" ? "danger" : "primary"} onClick={handleApply}>
            应用更改
          </Button>
        </div>
      }
    >
      <div className="rounded-xl border border-border bg-surface-2/60 p-3">
        <p className="text-xs font-medium text-fg">选中的文档</p>
        <ul className="mt-1.5 space-y-1 text-xs text-muted">
          {targets.slice(0, 3).map((target) => (
            <li key={target.document.id} className="truncate">
              · {target.document.title}
            </li>
          ))}
          {targets.length > 3 ? <li>等 {targets.length} 篇文档</li> : null}
        </ul>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <p className="text-xs font-medium text-fg">应用对象</p>
          <div className="mt-1.5">
            <SubjectSelect
              value={subjectValue}
              onChange={(value) => {
                setSubjectValue(value);
                setError(null);
              }}
              label="选择要批量授权的用户或用户组"
            />
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-fg">权限</p>
          <div className="mt-1.5">
            <PermissionSelect value={permission} onChange={setPermission} label="选择批量权限" />
          </div>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>

      <div className="mt-4">
        <InfoBanner
          tone={permission === "deny" ? "danger" : "warning"}
          icon={permission === "deny" ? "ban" : "users"}
          title={permission === "deny" ? "拒绝优先于读取" : "权限变更提示"}
        >
          {subject
            ? `将影响约 ${subjectMemberCount(subject)} 人，覆盖 ${targets.length} 篇文档。`
            : `将影响 ${targets.length} 篇文档。`}
          {permission === "deny"
            ? " 被拒绝的主体即使通过知识库默认或其他用户组获得读取权限，也将无法访问。"
            : " 已有相同主体例外会被替换，不会产生重复规则。"}
        </InfoBanner>
      </div>

      <p className="mt-3 text-[11px] text-subtle">保存后权限将在下一次提问时生效。</p>
    </Drawer>
  );
}
