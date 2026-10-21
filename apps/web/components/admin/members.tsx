"use client";

import { useMemo, useState } from "react";
import {
  type AdminGroup,
  type AdminKnowledgeBase,
  type AdminUser,
  activeGroupMembers,
  findGroup,
  groups,
  lastActiveLabels,
  readableDocumentsFor,
  roleLabels,
  totalDocuments,
  type UserRole,
  users,
} from "@/lib/admin-data";
import { Icon } from "../icons";
import { useAdminData } from "./admin-data";
import { Drawer } from "./drawer";
import { Tabs } from "./tabs";
import {
  Badge,
  Button,
  EmptyState,
  FilterChip,
  InfoBanner,
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

export function MembersPage() {
  const { knowledgeBases } = useAdminData();
  const [tab, setTab] = useState<DirectoryTab>("members");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const normalized = query.trim().toLowerCase();
  const totalDocs = totalDocuments(knowledgeBases);
  const activeUsers = users.filter((user) => user.status === "active").length;

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
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
    [normalized, roleFilter, statusFilter],
  );

  const filteredGroups = useMemo(
    () =>
      groups.filter(
        (group) =>
          !normalized ||
          group.name.toLowerCase().includes(normalized) ||
          group.externalId.toLowerCase().includes(normalized),
      ),
    [normalized],
  );

  const selectedUser = users.find((user) => user.id === selectedUserId);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Directory"
        title="成员与组"
        description="查看成员角色、用户组与文档访问范围。成员与用户组来自本地数据库，当前只读。"
        actions={
          <Badge tone="neutral">
            <Icon name="lock" size={12} />
            本地数据 · 只读
          </Badge>
        }
      />

      <StatStrip
        items={[
          { label: "成员总数", value: users.length, hint: "含停用账号" },
          { label: "活跃成员", value: activeUsers, hint: "参与权限计算" },
          { label: "用户组", value: groups.length, hint: "本地数据库" },
          { label: "数据来源", value: "本地 MySQL", hint: "当前只读" },
        ]}
      />

      <InfoBanner tone="neutral" icon="database" title="本地数据库成员，当前只读">
        成员、用户组与角色来自本地数据库种子数据。成员/组查询 API
        与角色编辑将在后续冲刺接入；此页的可读文档数为本地预览，不是服务端判定。
      </InfoBanner>

      <Tabs
        items={[
          { id: "members", label: "成员", count: users.length },
          { id: "groups", label: "用户组", count: groups.length },
        ]}
        value={tab}
        onChange={(next) => {
          setTab(next);
          setQuery("");
          setSelectedUserId(null);
          setSelectedGroupId(null);
        }}
        label="成员与用户组视图"
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
                        共 {filteredUsers.length} 名成员 · 活跃 {activeUsers} 名
                      </span>
                      <span>成员来自本地数据库</span>
                    </>
                  }
                >
                  <thead>
                    <tr>
                      <th className={thClass}>成员</th>
                      <th className={thClass}>角色</th>
                      <th className={thClass}>用户组</th>
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
                    knowledgeBases={knowledgeBases}
                    totalDocs={totalDocs}
                    onOpen={() => setSelectedUserId(user.id)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <SearchInput
            value={query}
            onChange={(value) => {
              setQuery(value);
              setSelectedGroupId(null);
            }}
            placeholder="搜索用户组或外部 ID"
            label="搜索用户组"
          />

          {filteredGroups.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface">
              <EmptyState
                icon="search"
                title="没有匹配的用户组"
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
                      <span>共 {filteredGroups.length} 个用户组</span>
                      <span>本地数据库 · 只读</span>
                    </>
                  }
                >
                  <thead>
                    <tr>
                      <th className={thClass}>用户组</th>
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
          knowledgeBases={knowledgeBases}
          totalDocs={totalDocs}
          onClose={() => setSelectedUserId(null)}
        />
      ) : null}

      {selectedGroup ? (
        <GroupDrawer group={selectedGroup} onClose={() => setSelectedGroupId(null)} />
      ) : null}
    </div>
  );
}

function MemberRow({
  user,
  knowledgeBases,
  totalDocs,
  onOpen,
}: {
  user: AdminUser;
  knowledgeBases: AdminKnowledgeBase[];
  totalDocs: number;
  onOpen: () => void;
}) {
  const memberGroups = user.groupIds.flatMap((groupId) => {
    const group = findGroup(groupId);
    return group ? [group] : [];
  });
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
        <p className="text-xs text-muted">{lastActiveLabels[user.id] ?? "—"}</p>
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
  knowledgeBases,
  totalDocs,
  onOpen,
}: {
  user: AdminUser;
  knowledgeBases: AdminKnowledgeBase[];
  totalDocs: number;
  onOpen: () => void;
}) {
  const memberGroups = user.groupIds.flatMap((groupId) => {
    const group = findGroup(groupId);
    return group ? [group] : [];
  });
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
        <span>最近活跃 {lastActiveLabels[user.id] ?? "—"}</span>
      </div>
      <div className="mt-3">
        <Button size="sm" variant="secondary" onClick={onOpen}>
          查看成员
        </Button>
      </div>
    </li>
  );
}

function GroupRow({ group, onOpen }: { group: AdminGroup; onOpen: () => void }) {
  const members = activeGroupMembers(group.id);
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
        <p className="text-sm tabular-nums text-fg">{members.length} 人</p>
      </td>
      <td className={tdClass}>
        {members.length === 0 ? (
          <span className="text-[11px] text-warning">暂无成员</span>
        ) : (
          <p className="max-w-[240px] truncate text-xs text-muted">
            {members
              .slice(0, 3)
              .map((member) => member.name)
              .join("、")}
            {members.length > 3 ? ` 等 ${members.length} 人` : ""}
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

function GroupCard({ group, onOpen }: { group: AdminGroup; onOpen: () => void }) {
  const members = activeGroupMembers(group.id);
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
        {members.length} 人 ·{" "}
        {members
          .slice(0, 3)
          .map((member) => member.name)
          .join("、")}
        {members.length > 3 ? " 等" : ""}
      </p>
      <div className="mt-3">
        <Button size="sm" variant="secondary" onClick={onOpen}>
          查看用户组
        </Button>
      </div>
    </li>
  );
}

function MemberDrawer({
  user,
  knowledgeBases,
  totalDocs,
  onClose,
}: {
  user: AdminUser;
  knowledgeBases: AdminKnowledgeBase[];
  totalDocs: number;
  onClose: () => void;
}) {
  const memberGroups = user.groupIds.flatMap((groupId) => {
    const group = findGroup(groupId);
    return group ? [group] : [];
  });
  const readable = readableDocumentsFor(user, knowledgeBases).length;

  return (
    <Drawer
      open
      onClose={onClose}
      title={user.name}
      description={`${user.email} · 本地数据库`}
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
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

      <section className="mt-4">
        <h3 className="text-xs font-medium text-fg">用户组</h3>
        <p className="mt-1 text-[11px] text-subtle">用户组来自本地数据库，当前只读。</p>
        {memberGroups.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-subtle">
            未加入任何用户组。
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {memberGroups.map((group) => (
              <li
                key={group.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
              >
                <Icon name="users" size={14} className="shrink-0 text-subtle" />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{group.name}</span>
                <span className="shrink-0 text-[11px] text-subtle">
                  {activeGroupMembers(group.id).length} 人
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4">
        <h3 className="text-xs font-medium text-fg">文档访问</h3>
        <div className="mt-2 rounded-xl border border-border bg-surface-2/60 p-3">
          <p className="text-sm font-medium text-fg">
            可读 {readable} / {totalDocs} 篇文档
          </p>
          <p className="mt-1 text-[11px] leading-5 text-subtle">
            本地预览：基于当前页面可见文档与种子成员快照计算，不是服务端按成员判定。成员 API
            接入后替换。
          </p>
          <div className="mt-2">
            <LinkButton href="/permissions" size="sm">
              查看文档权限
              <Icon name="chevron-right" size={13} />
            </LinkButton>
          </div>
        </div>
      </section>

      <section className="mt-4">
        <h3 className="text-xs font-medium text-fg">数据来源</h3>
        <dl className="mt-2 grid gap-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-subtle">来源</dt>
            <dd className="text-fg">本地 MySQL</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-subtle">成员 API</dt>
            <dd className="text-fg">下一冲刺接入</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-subtle">最近活跃（示例）</dt>
            <dd className="text-fg">{lastActiveLabels[user.id] ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <div className="mt-4">
        <InfoBanner tone="neutral" icon="lock" title="只读">
          成员、用户组与角色来自本地数据库，当前只读；角色编辑与密码重置将在后续开放。
        </InfoBanner>
      </div>
    </Drawer>
  );
}

function GroupDrawer({ group, onClose }: { group: AdminGroup; onClose: () => void }) {
  const members = activeGroupMembers(group.id);
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
        <p className="text-sm font-medium text-fg">{members.length} 名活跃成员</p>
        <p className="mt-1 text-[11px] leading-5 text-subtle">
          用户组来自本地数据库。文档权限在“文档权限”中按文档配置，用户组本身不直接授予访问。
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
        {members.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-warning/40 bg-warning-soft px-3 py-2.5 text-xs text-warning">
            该用户组暂无活跃成员。绑定到文档的读取或拒绝规则暂时不会影响任何人。
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {members.map((member) => (
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
            <dd className="text-fg">本地 MySQL · 只读</dd>
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
