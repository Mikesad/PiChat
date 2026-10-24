"use client";

import { useEffect, useState } from "react";
import { formatUpdatedLabel } from "@/lib/admin-data";
import {
  createEmptyToolboxState,
  loadToolboxState,
  type McpServerEntry,
  mcpTransportMeta,
  type SkillEntry,
  saveToolboxState,
  type ToolboxState,
} from "@/lib/toolbox-data";
import { cn } from "@/lib/utils";
import { Icon } from "../icons";
import { ConfirmDialog } from "./confirm-dialog";
import { Tabs } from "./tabs";
import { useToast } from "./toast";
import { ToolboxMcpDrawer } from "./toolbox-mcp-drawer";
import { ToolboxSkillDrawer } from "./toolbox-skill-drawer";
import { Badge, Button, EmptyState, PageHeader, Switch } from "./ui";

type ToolboxTab = "skills" | "mcp" | "browser";

export function Toolbox() {
  const { showToast } = useToast();
  const [state, setState] = useState<ToolboxState>(createEmptyToolboxState);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<ToolboxTab>("skills");
  const [skillDrawerOpen, setSkillDrawerOpen] = useState(false);
  const [mcpDrawer, setMcpDrawer] = useState<{ open: boolean; server: McpServerEntry | null }>({
    open: false,
    server: null,
  });
  const [removingSkill, setRemovingSkill] = useState<SkillEntry | null>(null);
  const [removingMcp, setRemovingMcp] = useState<McpServerEntry | null>(null);

  useEffect(() => {
    setState(loadToolboxState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      saveToolboxState(state);
    }
  }, [state, hydrated]);

  function handleAddSkill(skill: SkillEntry) {
    setState((previous) => ({ ...previous, skills: [skill, ...previous.skills] }));
    setSkillDrawerOpen(false);
    setTab("skills");
    showToast(`技能已登记：${skill.name}`);
  }

  function handleToggleSkill(skill: SkillEntry, enabled: boolean) {
    setState((previous) => ({
      ...previous,
      skills: previous.skills.map((item) => (item.id === skill.id ? { ...item, enabled } : item)),
    }));
  }

  function handleRemoveSkill() {
    if (!removingSkill) {
      return;
    }
    setState((previous) => ({
      ...previous,
      skills: previous.skills.filter((item) => item.id !== removingSkill.id),
    }));
    showToast(`已移除技能：${removingSkill.name}`);
    setRemovingSkill(null);
  }

  function handleSaveMcp(server: McpServerEntry) {
    setState((previous) => {
      const exists = previous.mcpServers.some((item) => item.id === server.id);
      return {
        ...previous,
        mcpServers: exists
          ? previous.mcpServers.map((item) => (item.id === server.id ? server : item))
          : [server, ...previous.mcpServers],
      };
    });
    setMcpDrawer({ open: false, server: null });
    setTab("mcp");
    showToast(`MCP 服务已保存：${server.name}`);
  }

  function handleToggleMcp(server: McpServerEntry, enabled: boolean) {
    setState((previous) => ({
      ...previous,
      mcpServers: previous.mcpServers.map((item) =>
        item.id === server.id ? { ...item, enabled } : item,
      ),
    }));
  }

  function handleRemoveMcp() {
    if (!removingMcp) {
      return;
    }
    setState((previous) => ({
      ...previous,
      mcpServers: previous.mcpServers.filter((item) => item.id !== removingMcp.id),
    }));
    showToast(`已移除 MCP 服务：${removingMcp.name}`);
    setRemovingMcp(null);
  }

  function handleConfigureSandbox() {
    showToast("沙箱配置将在后端接入后开放", "neutral");
  }

  const actions =
    tab === "skills" ? (
      <Button onClick={() => setSkillDrawerOpen(true)}>
        <Icon name="plus" size={15} />
        添加技能
      </Button>
    ) : tab === "mcp" ? (
      <Button onClick={() => setMcpDrawer({ open: true, server: null })}>
        <Icon name="plus" size={15} />
        添加 MCP 服务
      </Button>
    ) : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="扩展能力"
        title="工具箱"
        description="技能属于空间目录，可以只登记，也可以装到一份或多份沙箱。智能体只能启用当前沙箱里已就绪的技能。当前为前端预览，配置保存在本地浏览器。"
        actions={actions}
      />

      <Tabs
        items={[
          { id: "skills", label: "技能管理", icon: "file-text", count: state.skills.length },
          { id: "mcp", label: "MCP 服务", icon: "plug", count: state.mcpServers.length },
          { id: "browser", label: "浏览器连接", icon: "globe", statusLabel: "未配对" },
        ]}
        value={tab}
        onChange={setTab}
        label="工具箱分类"
      />

      {!hydrated ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-xs text-subtle">
          正在加载工具箱…
        </div>
      ) : tab === "skills" ? (
        state.skills.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface">
            <EmptyState
              icon="wrench"
              title="暂无数据"
              description="还没有技能。添加后可以装到一份或多份沙箱。当前没有沙箱，带脚本的技能登记后无法运行，可先去配置沙箱。"
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => setSkillDrawerOpen(true)}>
                    <Icon name="plus" size={14} />
                    添加技能
                  </Button>
                  <Button variant="secondary" onClick={handleConfigureSandbox}>
                    去配置沙箱
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-surface-2/50 px-3.5 py-2.5 text-[11px] leading-5 text-subtle">
              当前没有沙箱：技能可以登记和启用，但带脚本的技能要等沙箱接入后才能实际运行。
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {state.skills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onToggle={(enabled) => handleToggleSkill(skill, enabled)}
                  onRemove={() => setRemovingSkill(skill)}
                />
              ))}
              <button
                type="button"
                onClick={() => setSkillDrawerOpen(true)}
                className="flex min-h-[172px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface/60 text-subtle transition-colors duration-150 hover:border-accent hover:bg-accent-soft/40 hover:text-fg"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-surface-2">
                  <Icon name="plus" size={17} />
                </span>
                <span className="text-xs font-medium">添加技能</span>
              </button>
            </div>
          </div>
        )
      ) : tab === "mcp" ? (
        state.mcpServers.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface">
            <EmptyState
              icon="plug"
              title="暂无数据"
              description="还没有配置 MCP 服务。连接外部 MCP 服务后，智能体即可调用其中的工具。"
              action={
                <Button onClick={() => setMcpDrawer({ open: true, server: null })}>
                  <Icon name="plus" size={14} />
                  添加 MCP 服务
                </Button>
              }
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {state.mcpServers.map((server) => (
              <McpCard
                key={server.id}
                server={server}
                onToggle={(enabled) => handleToggleMcp(server, enabled)}
                onEdit={() => setMcpDrawer({ open: true, server })}
                onRemove={() => setRemovingMcp(server)}
              />
            ))}
            <button
              type="button"
              onClick={() => setMcpDrawer({ open: true, server: null })}
              className="flex min-h-[172px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface/60 text-subtle transition-colors duration-150 hover:border-accent hover:bg-accent-soft/40 hover:text-fg"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-surface-2">
                <Icon name="plus" size={17} />
              </span>
              <span className="text-xs font-medium">添加 MCP 服务</span>
            </button>
          </div>
        )
      ) : (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon="globe"
            title="浏览器连接未配对"
            description="配对后智能体可以在授权浏览器中执行操作。当前版本仅保留入口，配对流程待后端接入。"
            action={
              <Button variant="secondary" disabled>
                等待后端接入
              </Button>
            }
          />
        </div>
      )}

      {skillDrawerOpen ? (
        <ToolboxSkillDrawer onClose={() => setSkillDrawerOpen(false)} onSave={handleAddSkill} />
      ) : null}

      {mcpDrawer.open ? (
        <ToolboxMcpDrawer
          server={mcpDrawer.server}
          onClose={() => setMcpDrawer({ open: false, server: null })}
          onSave={handleSaveMcp}
        />
      ) : null}

      <ConfirmDialog
        open={removingSkill !== null}
        onClose={() => setRemovingSkill(null)}
        onConfirm={handleRemoveSkill}
        title="移除技能？"
        description={
          removingSkill
            ? `将把「${removingSkill.name}」从空间目录移除。当前版本未接入沙箱，不会影响其他环境。`
            : ""
        }
        confirmLabel="移除"
        tone="danger"
      />

      <ConfirmDialog
        open={removingMcp !== null}
        onClose={() => setRemovingMcp(null)}
        onConfirm={handleRemoveMcp}
        title="移除 MCP 服务？"
        description={
          removingMcp
            ? `将删除「${removingMcp.name}」的连接配置，智能体将无法再调用该服务的工具。`
            : ""
        }
        confirmLabel="移除"
        tone="danger"
      />
    </div>
  );
}

function SkillCard({
  skill,
  onToggle,
  onRemove,
}: {
  skill: SkillEntry;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <article className="flex flex-col rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent-text">
          <Icon name={skill.sourceType === "zip" ? "file-text" : "sparkles"} size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-medium text-fg">{skill.name}</h3>
            <Badge tone={skill.enabled ? "success" : "neutral"}>
              {skill.enabled ? "已启用" : "已停用"}
            </Badge>
            <Badge tone="outline">{skill.sourceType === "zip" ? "压缩包" : "来源链接"}</Badge>
          </div>
          <p className="mt-1 truncate font-mono text-[10px] text-subtle">{skill.source}</p>
          {skill.description ? (
            <p className="mt-1.5 text-xs leading-5 text-muted">{skill.description}</p>
          ) : null}
          <p className="mt-1 text-[11px] text-subtle">
            登记于 {formatUpdatedLabel(skill.createdAt)}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <Switch
            checked={skill.enabled}
            onChange={onToggle}
            label={`${skill.enabled ? "停用" : "启用"} ${skill.name}`}
          />
          {skill.enabled ? "已启用" : "已停用"}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-9 cursor-pointer items-center rounded-lg px-2.5 text-xs font-medium text-danger transition-colors duration-150 hover:bg-danger-soft"
        >
          移除
        </button>
      </div>
    </article>
  );
}

function McpCard({
  server,
  onToggle,
  onEdit,
  onRemove,
}: {
  server: McpServerEntry;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const authLabel =
    server.authType === "none"
      ? "无认证"
      : server.authType === "oauth"
        ? "OAuth 2.0"
        : `${server.authHeaderName || "API Key"} · ${
            server.hasCredential ? server.credentialHint : "未保存密钥"
          }`;

  return (
    <article
      className={cn(
        "flex flex-col rounded-xl border bg-surface p-3.5 transition-colors duration-150",
        server.enabled ? "border-border" : "border-border/70",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent-text">
          <Icon name="plug" size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-medium text-fg">{server.name}</h3>
            <Badge tone={server.enabled ? "success" : "neutral"}>
              {server.enabled ? "已启用" : "已停用"}
            </Badge>
            <Badge tone="outline">{mcpTransportMeta[server.transport].label}</Badge>
          </div>
          <p className="mt-1 truncate font-mono text-[10px] text-subtle">{server.url}</p>
          <p className="mt-1.5 text-[11px] text-subtle">
            {authLabel}
            {server.headers.length > 0 ? ` · ${server.headers.length} 个自定义请求头` : ""}
          </p>
          {server.purpose ? (
            <p className="mt-1.5 text-xs leading-5 text-muted">{server.purpose}</p>
          ) : null}
          <p className="mt-1 text-[11px] text-subtle">
            添加于 {formatUpdatedLabel(server.createdAt)}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <Switch
            checked={server.enabled}
            onChange={onToggle}
            label={`${server.enabled ? "停用" : "启用"} ${server.name}`}
          />
          {server.enabled ? "已启用" : "已停用"}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            编辑
          </Button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-9 cursor-pointer items-center rounded-lg px-2.5 text-xs font-medium text-danger transition-colors duration-150 hover:bg-danger-soft"
          >
            移除
          </button>
        </div>
      </div>
    </article>
  );
}
