"use client";

import { defaultPageSize, type MemberSummary, type PaginationMeta } from "@pichat/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AdminGroup,
  type AdminKnowledgeBase,
  type AdminUser,
  readableDocumentsFor,
  roleLabels,
  totalDocuments,
  type UserRole,
} from "@/lib/admin-data";
import {
  ApiError,
  apiErrorMessage,
  fetchMembers,
  resetMemberPassword,
  updateMember,
} from "@/lib/api-client";
import { useAuth } from "../auth/auth-provider";
import { Icon } from "../icons";
import { useAdminData } from "./admin-data";
import { useDirectory } from "./directory";
import { Drawer } from "./drawer";
import { Pagination } from "./pagination";
import { Tabs } from "./tabs";
import {
  Badge,
  Button,
  EmptyState,
  FilterChip,
  LinkButton,
  PageHeader,
  SearchInput,
  StatStrip,
  TableShell,
  tdClass,
  thClass,
  trClass,
} from "./ui";

type DirectoryTab = "members" | "groups";

const roleTones: Record<UserRole, "neutral" | "accent" | "warning" | "success"> = {
  member: "neutral",
  knowledge_admin: "accent",
  security_admin: "warning",
  tenant_admin: "success",
};

function toAdminUser(member: MemberSummary): AdminUser {
  return {
    id: member.id,
    name: member.displayName,
    email: member.email,
    role: member.role,
    departmentId: member.departmentId,
    status: member.status,
    lastActiveAt: member.lastActiveAt,
  };
}

function formatLastActive(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  const now = new Date();
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${time}`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

export function MembersPage() {
  const { knowledgeBases } = useAdminData();
  const { reload: reloadSubjects } = useDirectory();
  const { user: currentUser, logout } = useAuth();
  const [members, setMembers] = useState<AdminUser[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [directoryStatus, setDirectoryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [tab, setTab] = useState<DirectoryTab>("members");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);

  const reloadDirectory = useCallback(async () => {
    setDirectoryStatus((current) => (current === "ready" ? "ready" : "loading"));
    setDirectoryError(null);
    try {
      const response = await fetchMembers({ page, pageSize });
      setMembers(response.members.map(toAdminUser));
      setTotal(response.pagination.total);
      setGroups(
        response.groups.map((group) => ({
          id: group.id,
          name: group.name,
          externalId: group.externalId ?? "",
        })),
      );
      setDirectoryStatus("ready");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await logout();
      }
      setDirectoryError(apiErrorMessage(cause));
      setDirectoryStatus("error");
    }
  }, [logout, page, pageSize]);

  useEffect(() => {
    void reloadDirectory();
  }, [reloadDirectory]);

  const handleMemberUpdated = useCallback(async () => {
    await reloadDirectory();
    await reloadSubjects();
  }, [reloadDirectory, reloadSubjects]);

  const normalized = query.trim().toLowerCase();
  const totalDocs = totalDocuments(knowledgeBases);
  const activeUsers = members.filter((user) => user.status === "active").length;

  const filteredUsers = useMemo(
    () =>
      members.filter((user) => {
        if (
          normalized &&
          !user.name.toLowerCase().includes(normalized) &&
          !user.email.toLowerCase().includes(normalized)
        ) {
          return false;
        }
        if (roleFilter !== "all" && user.role !== roleFilter) {
          return false;
        }
        if (statusFilter !== "all" && user.status !== statusFilter) {
          return false;
        }
        return true;
      }),
    [members, normalized, roleFilter, statusFilter],
  );

  const filteredGroups = useMemo(
    () =>
      groups.filter(
        (group) =>
          !normalized ||
          group.name.toLowerCase().includes(normalized) ||
          group.externalId.toLowerCase().includes(normalized),
      ),
    [groups, normalized],
  );

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

  const selectedUser = members.find((user) => user.id === selectedUserId);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Directory"
        title="部门成员"
        description="查看并编辑成员角色、状态、部门与文档访问范围。成员与部门来自本地数据库。"
        actions={
          <Badge tone="neutral">
            <Icon name="database" size={12} />
            本地 MySQL
          </Badge>
        }
      />

      <StatStrip
        items={[
          { label: "成员总数", value: total, hint: "含停用账号" },
          { label: "活跃成员", value: activeUsers, hint: "当前页" },
          { label: "部门", value: groups.length, hint: "本地数据库" },
          { label: "数据来源", value: "本地 MySQL", hint: "实时查询" },
        ]}
      />

      {directoryStatus === "loading" ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-6 text-sm text-muted">
          正在加载成员…
        </div>
      ) : null}
      {directoryStatus === "error" ? (
        <div className="rounded-xl border border-danger/30 bg-danger-soft/40 px-4 py-4">
          <p className="text-sm text-fg">成员加载失败：{directoryError}</p>
          <Button
            className="mt-2"
            size="sm"
            variant="secondary"
            onClick={() => void reloadDirectory()}
          >
            重试
          </Button>
        </div>
      ) : null}

      <Tabs
        items={[
          { id: "members", label: "成员", count: total },
          { id: "groups", label: "部门", count: groups.length },
        ]}
        value={tab}
        onChange={(next) => {
          setTab(next);
          setQuery("");
          setSelectedUserId(null);
          setSelectedGroupId(null);
        }}
        label="成员与部门视图"
      />

      {tab === "members" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={query}
              onChange={(value) => {
                setQuery(value);
                setSelectedUserId(null);
              }}
              placeholder="搜索姓名或邮箱"
              label="搜索成员"
            />
            <div className="w-full sm:w-44">
              <label htmlFor="member-role" className="sr-only">
                按角色筛选
              </label>
              <select
                id="member-role"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as "all" | UserRole)}
                className="h-10 w-full cursor-pointer rounded-lg border border-border bg-surface px-2.5 text-sm text-fg focus:border-accent sm:h-9"
              >
                <option value="all">全部角色</option>
                {(Object.keys(roleLabels) as UserRole[]).map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
                全部状态
              </FilterChip>
              <FilterChip
                active={statusFilter === "active"}
                onClick={() => setStatusFilter("active")}
              >
                活跃
              </FilterChip>
              <FilterChip
                active={statusFilter === "disabled"}
                onClick={() => setStatusFilter("disabled")}
              >
                停用
              </FilterChip>
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface">
              <EmptyState
                icon="search"
                title="没有匹配的成员"
                description="调整关键词、角色或状态后再试。"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setQuery("");
                      setRoleFilter("all");
                      setStatusFilter("all");
                    }}
                  >
                    清除筛选
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <div className="hidden xl:block">
                <TableShell
                  minWidth={760}
                  footer={
                    <>
                      <span>
                        当前页 {filteredUsers.length} 名 · 活跃 {activeUsers} 名
                      </span>
                      <span>成员来自本地数据库</span>
                    </>
                  }
                >
                  <thead>
                    <tr>
                      <th className={thClass}>成员</th>
                      <th className={thClass}>角色</th>
                      <th className={thClass}>部门</th>
                      <th className={thClass}>状态</th>
                      <th className={thClass}>可读文档（本地预览）</th>
                      <th className={thClass}>最近活跃</th>
                      <th className={thClass}>
                        <span className="sr-only">操作</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <MemberRow
                        key={user.id}
                        user={user}
                        groups={groups}
                        knowledgeBases={knowledgeBases}
                        totalDocs={totalDocs}
                        onOpen={() => setSelectedUserId(user.id)}
                      />
                    ))}
                  </tbody>
                </TableShell>
              </div>

              <ul className="space-y-2 xl:hidden">
                {filteredUsers.map((user) => (
                  <MemberCard
                    key={user.id}
                    user={user}
                    groups={groups}
                    knowledgeBases={knowledgeBases}
                    totalDocs={totalDocs}
                    onOpen={() => setSelectedUserId(user.id)}
                  />
                ))}
              </ul>
            </>
          )}

          <Pagination
            pagination={pagination}
            onPageChange={(next) => {
              setPage(next);
              setSelectedUserId(null);
            }}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
              setSelectedUserId(null);
            }}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <SearchInput
            value={query}
            onChange={(value) => {
              setQuery(value);
              setSelectedGroupId(null);
            }}
            placeholder="搜索部门或外部 ID"
            label="搜索部门"
          />

          {filteredGroups.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface">
              <EmptyState
                icon="search"
                title="没有匹配的部门"
                description="换一个关键词或清除搜索后重试。"
                action={
                  <Button variant="secondary" onClick={() => setQuery("")}>
                    清除搜索
                  </Button>
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
                      <span>共 {filteredGroups.length} 个部门</span>
                      <span>本地数据库 · 实时查询</span>
                    </>
                  }
                >
                  <thead>
                    <tr>
                      <th className={thClass}>部门</th>
                      <th className={thClass}>外部 ID（历史字段）</th>
                      <th className={thClass}>成员</th>
                      <th className={thClass}>成员预览</th>
                      <th className={thClass}>来源</th>
                      <th className={thClass}>
                        <span className="sr-only">操作</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGroups.map((group) => (
                      <GroupRow
                        key={group.id}
                        group={group}
                        members={members}
                        onOpen={() => setSelectedGroupId(group.id)}
                      />
                    ))}
                  </tbody>
                </TableShell>
              </div>

              <ul className="space-y-2 xl:hidden">
                {filteredGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    members={members}
                    onOpen={() => setSelectedGroupId(group.id)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {selectedUser ? (
        <MemberDrawer
          user={selectedUser}
          groups={groups}
          allMembers={members}
          knowledgeBases={knowledgeBases}
          totalDocs={totalDocs}
          canEdit={currentUser?.role === "tenant_admin"}
          isSelf={currentUser?.id === selectedUser.id}
          onUpdated={handleMemberUpdated}
          onClose={() => setSelectedUserId(null)}
        />
      ) : null}

      {selectedGroup ? (
        <GroupDrawer
          group={selectedGroup}
          members={members}
          onClose={() => setSelectedGroupId(null)}
        />
      ) : null}
    </div>
  );
}

function MemberRow({
  user,
  groups,
  knowledgeBases,
  totalDocs,
  onOpen,
}: {
  user: AdminUser;
  groups: AdminGroup[];
  knowledgeBases: AdminKnowledgeBase[];
  totalDocs: number;
  onOpen: () => void;
}) {
  const memberGroups = groups.filter((group) => group.id === user.departmentId);
  const readable = readableDocumentsFor(user, knowledgeBases).length;

  return (
    <tr className={trClass}>
      <td className={tdClass}>
        <div className="flex items-center gap-2.5">
          <Avatar name={user.name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{user.name}</p>
            <p className="mt-0.5 truncate text-[11px] text-subtle">{user.email}</p>
          </div>
        </div>
      </td>
      <td className={tdClass}>
        <Badge tone={roleTones[user.role]}>{roleLabels[user.role]}</Badge>
      </td>
      <td className={tdClass}>
        <div className="flex flex-wrap items-center gap-1">
          {memberGroups.slice(0, 2).map((group) => (
            <Badge key={group.id} tone="outline">
              <Icon name="users" size={10} />
              {group.name}
            </Badge>
          ))}
          {memberGroups.length > 2 ? (
            <span className="text-[11px] text-subtle">+{memberGroups.length - 2}</span>
          ) : null}
        </div>
      </td>
      <td className={tdClass}>
        <Badge tone={user.status === "active" ? "success" : "neutral"}>
          {user.status === "active" ? "活跃" : "停用"}
        </Badge>
      </td>
      <td className={tdClass}>
        <p className="text-sm tabular-nums text-fg">
          {readable} / {totalDocs}
        </p>
        <p className="mt-0.5 text-[11px] text-subtle">本地预览，非服务端判定</p>
      </td>
      <td className={tdClass}>
        <p className="text-xs text-muted">{formatLastActive(user.lastActiveAt)}</p>
      </td>
      <td className={`${tdClass} text-right`}>
        <Button size="sm" variant="secondary" onClick={onOpen}>
          查看
        </Button>
      </td>
    </tr>
  );
}

function MemberCard({
  user,
  groups,
  knowledgeBases,
  totalDocs,
  onOpen,
}: {
  user: AdminUser;
  groups: AdminGroup[];
  knowledgeBases: AdminKnowledgeBase[];
  totalDocs: number;
  onOpen: () => void;
}) {
  const memberGroups = groups.filter((group) => group.id === user.departmentId);
  const readable = readableDocumentsFor(user, knowledgeBases).length;

  return (
    <li className="rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-start gap-2.5">
        <Avatar name={user.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{user.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-subtle">{user.email}</p>
        </div>
        <Badge tone={user.status === "active" ? "success" : "neutral"}>
          {user.status === "active" ? "活跃" : "停用"}
        </Badge>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={roleTones[user.role]}>{roleLabels[user.role]}</Badge>
        {memberGroups.map((group) => (
          <Badge key={group.id} tone="outline">
            <Icon name="users" size={10} />
            {group.name}
          </Badge>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
        <span className="text-fg">
          可读 {readable} / {totalDocs} 篇（本地预览）
        </span>
        <span>最近活跃 {formatLastActive(user.lastActiveAt)}</span>
      </div>
      <div className="mt-3">
        <Button size="sm" variant="secondary" onClick={onOpen}>
          查看成员
        </Button>
      </div>
    </li>
  );
}

function GroupRow({
  group,
  members,
  onOpen,
}: {
  group: AdminGroup;
  members: AdminUser[];
  onOpen: () => void;
}) {
  const groupMembers = members.filter(
    (member) => member.status === "active" && member.departmentId === group.id,
  );
  return (
    <tr className={trClass}>
      <td className={tdClass}>
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-subtle">
            <Icon name="users" size={15} />
          </span>
          <p className="text-sm font-medium text-fg">{group.name}</p>
        </div>
      </td>
      <td className={tdClass}>
        <p className="font-mono text-[11px] text-muted">{group.externalId}</p>
      </td>
      <td className={tdClass}>
        <p className="text-sm tabular-nums text-fg">{groupMembers.length} 人</p>
      </td>
      <td className={tdClass}>
        {groupMembers.length === 0 ? (
          <span className="text-[11px] text-warning">暂无成员</span>
        ) : (
          <p className="max-w-[240px] truncate text-xs text-muted">
            {groupMembers
              .slice(0, 3)
              .map((member) => member.name)
              .join("、")}
            {groupMembers.length > 3 ? ` 等 ${groupMembers.length} 人` : ""}
          </p>
        )}
      </td>
      <td className={tdClass}>
        <Badge tone="neutral">
          <Icon name="database" size={10} />
          本地
        </Badge>
      </td>
      <td className={`${tdClass} text-right`}>
        <Button size="sm" variant="secondary" onClick={onOpen}>
          查看
        </Button>
      </td>
    </tr>
  );
}

function GroupCard({
  group,
  members,
  onOpen,
}: {
  group: AdminGroup;
  members: AdminUser[];
  onOpen: () => void;
}) {
  const groupMembers = members.filter(
    (member) => member.status === "active" && member.departmentId === group.id,
  );
  return (
    <li className="rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-subtle">
          <Icon name="users" size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{group.name}</p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-subtle">{group.externalId}</p>
        </div>
        <Badge tone="neutral">本地</Badge>
      </div>
      <p className="mt-2.5 text-[11px] text-subtle">
        {groupMembers.length} 人 ·{" "}
        {groupMembers
          .slice(0, 3)
          .map((member) => member.name)
          .join("、")}
        {groupMembers.length > 3 ? " 等" : ""}
      </p>
      <div className="mt-3">
        <Button size="sm" variant="secondary" onClick={onOpen}>
          查看部门
        </Button>
      </div>
    </li>
  );
}

function MemberDrawer({
  user,
  groups,
  allMembers,
  knowledgeBases,
  totalDocs,
  canEdit,
  isSelf,
  onUpdated,
  onClose,
}: {
  user: AdminUser;
  groups: AdminGroup[];
  allMembers: AdminUser[];
  knowledgeBases: AdminKnowledgeBase[];
  totalDocs: number;
  canEdit: boolean;
  isSelf: boolean;
  onUpdated: () => Promise<void>;
  onClose: () => void;
}) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [status, setStatus] = useState<"active" | "disabled">(user.status);
  const [departmentId, setDepartmentId] = useState<string | null>(user.departmentId);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setRole(user.role);
    setStatus(user.status);
    setDepartmentId(user.departmentId);
    setPassword("");
    setError(null);
    setNotice(null);
  }, [user]);

  const memberGroups = groups.filter((group) => group.id === user.departmentId);
  const readable = readableDocumentsFor(user, knowledgeBases).length;
  const dirty = role !== user.role || status !== user.status || departmentId !== user.departmentId;

  async function handleSave() {
    if (!canEdit) {
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await updateMember(user.id, { role, status, departmentId });
      await onUpdated();
      setNotice("成员信息已保存");
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!canEdit) {
      return;
    }
    if (password.length < 6) {
      setError("密码至少需要 6 个字符");
      return;
    }
    setResetting(true);
    setError(null);
    setNotice(null);
    try {
      await resetMemberPassword(user.id, password);
      setPassword("");
      setNotice("密码已重置，该成员现有会话已失效");
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setResetting(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={user.name}
      description={`${user.email} · 本地数据库`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
          {canEdit ? (
            <Button onClick={() => void handleSave()} disabled={!dirty || saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/60 p-4">
        <Avatar name={user.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg">{user.name}</p>
          <p className="mt-0.5 truncate text-xs text-subtle">{user.email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={roleTones[user.role]}>{roleLabels[user.role]}</Badge>
            <Badge tone={user.status === "active" ? "success" : "neutral"}>
              {user.status === "active" ? "活跃" : "停用"}
            </Badge>
          </div>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-danger/30 bg-danger-soft/40 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-3 rounded-lg border border-success/30 bg-success-soft/40 px-3 py-2 text-xs text-success">
          {notice}
        </p>
      ) : null}

      <section className="mt-4">
        <h3 className="text-xs font-medium text-fg">角色与状态</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-[11px] text-subtle">
            角色
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
              disabled={!canEdit || isSelf}
              className="h-9 rounded-lg border border-border bg-surface px-2.5 text-sm text-fg focus:border-accent"
            >
              {(Object.keys(roleLabels) as UserRole[]).map((item) => (
                <option key={item} value={item}>
                  {roleLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[11px] text-subtle">
            状态
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as "active" | "disabled")}
              disabled={!canEdit || isSelf}
              className="h-9 rounded-lg border border-border bg-surface px-2.5 text-sm text-fg focus:border-accent"
            >
              <option value="active">活跃</option>
              <option value="disabled">停用</option>
            </select>
          </label>
        </div>
        {isSelf ? <p className="mt-2 text-[11px] text-subtle">不能修改自己的角色或状态。</p> : null}
      </section>

      <section className="mt-4">
        <h3 className="text-xs font-medium text-fg">部门</h3>
        <p className="mt-1 text-[11px] text-subtle">一个成员只能属于一个部门，不选择表示未分配。</p>
        {groups.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-subtle">
            当前租户没有部门。
          </p>
        ) : (
          <label className="mt-2 grid gap-1 text-[11px] text-subtle">
            所属部门
            <select
              value={departmentId ?? ""}
              onChange={(event) => setDepartmentId(event.target.value || null)}
              disabled={!canEdit}
              className="h-9 rounded-lg border border-border bg-surface px-2.5 text-sm text-fg focus:border-accent"
            >
              <option value="">未分配</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}（
                  {
                    allMembers.filter(
                      (member) => member.status === "active" && member.departmentId === group.id,
                    ).length
                  }{" "}
                  人）
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className="mt-4">
        <h3 className="text-xs font-medium text-fg">文档访问</h3>
        <div className="mt-2 rounded-xl border border-border bg-surface-2/60 p-3">
          <p className="text-sm font-medium text-fg">
            可读 {readable} / {totalDocs} 篇文档
          </p>
          <p className="mt-1 text-[11px] leading-5 text-subtle">
            本地预览：基于当前页面可见文档与该成员的部门计算，不是服务端按成员逐篇判定。
          </p>
          <div className="mt-2">
            <LinkButton href="/permissions" size="sm">
              查看文档权限
              <Icon name="chevron-right" size={13} />
            </LinkButton>
          </div>
        </div>
      </section>

      {canEdit ? (
        <section className="mt-4">
          <h3 className="text-xs font-medium text-fg">重置密码</h3>
          <p className="mt-1 text-[11px] text-subtle">
            重置后该成员的所有登录会话会立即失效。当前账号密码不会显示。
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              placeholder="至少 6 个字符"
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 text-sm text-fg focus:border-accent"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleResetPassword()}
              disabled={resetting || password.length < 6}
            >
              {resetting ? "重置中…" : "重置密码"}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="mt-4">
        <h3 className="text-xs font-medium text-fg">数据来源</h3>
        <dl className="mt-2 grid gap-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-subtle">来源</dt>
            <dd className="text-fg">本地 MySQL</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-subtle">最近活跃</dt>
            <dd className="text-fg">{formatLastActive(user.lastActiveAt)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-subtle">部门</dt>
            <dd className="text-fg">{memberGroups[0]?.name ?? "未分配"}</dd>
          </div>
        </dl>
      </section>
    </Drawer>
  );
}

function GroupDrawer({
  group,
  members,
  onClose,
}: {
  group: AdminGroup;
  members: AdminUser[];
  onClose: () => void;
}) {
  const groupMembers = members.filter(
    (member) => member.status === "active" && member.departmentId === group.id,
  );
  return (
    <Drawer
      open
      onClose={onClose}
      title={group.name}
      description={`${group.externalId} · 本地数据库`}
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
        </div>
      }
    >
      <div className="rounded-xl border border-border bg-surface-2/60 p-4">
        <p className="text-sm font-medium text-fg">{groupMembers.length} 名活跃成员</p>
        <p className="mt-1 text-[11px] leading-5 text-subtle">
          部门来自本地数据库。文档权限在“文档权限”中按文档配置，部门本身不直接授予访问。
        </p>
        <div className="mt-2">
          <LinkButton href="/permissions" size="sm">
            查看文档权限
            <Icon name="chevron-right" size={13} />
          </LinkButton>
        </div>
      </div>

      <section className="mt-4">
        <h3 className="text-xs font-medium text-fg">成员</h3>
        {groupMembers.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-warning/40 bg-warning-soft px-3 py-2.5 text-xs text-warning">
            该部门暂无活跃成员。绑定到文档的读取或拒绝规则暂时不会影响任何人。
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {groupMembers.map((member) => (
              <li
                key={member.id}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2"
              >
                <Avatar name={member.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{member.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-subtle">{member.email}</p>
                </div>
                <Badge tone={roleTones[member.role]}>{roleLabels[member.role]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4">
        <h3 className="text-xs font-medium text-fg">数据来源</h3>
        <dl className="mt-2 grid gap-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-subtle">外部 ID（历史字段）</dt>
            <dd className="font-mono text-fg">{group.externalId}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-subtle">来源</dt>
            <dd className="text-fg">本地 MySQL</dd>
          </div>
        </dl>
      </section>
    </Drawer>
  );
}

function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  return (
    <span
      className={
        size === "lg"
          ? "flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-3 text-sm font-semibold text-fg"
          : "flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-fg"
      }
    >
      {name.slice(0, 1)}
    </span>
  );
}
