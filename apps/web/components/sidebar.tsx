"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { KnowledgeBase, Session } from "@/lib/chat-data";
import { cn } from "@/lib/utils";
import { Icon, LogoMark } from "./icons";
import { IconButton } from "./ui";
import { UserMenu } from "./user-menu";

export type SidebarMode = "chat" | "manage";
export type AdminSection = "knowledge" | "permissions" | "members" | "audit";

interface SidebarProps {
  mode: SidebarMode;
  activeSection?: AdminSection;
  sessions?: Session[];
  activeSessionId?: string;
  knowledgeBases?: KnowledgeBase[];
  mobileOpen: boolean;
  onSelectSession?: (id: string) => void;
  onNewChat?: () => void;
  onClose: () => void;
}

export function Sidebar({
  mode,
  activeSection = "knowledge",
  sessions = [],
  activeSessionId = "",
  knowledgeBases = [],
  mobileOpen,
  onSelectSession,
  onNewChat,
  onClose,
}: SidebarProps) {
  const mobileAsideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mobileOpen) {
      mobileAsideRef.current?.focus();
    }
  }, [mobileOpen]);

  return (
    <>
      <aside className="hidden w-[280px] shrink-0 border-r border-border bg-surface lg:block">
        <SidebarContent
          mode={mode}
          activeSection={activeSection}
          sessions={sessions}
          activeSessionId={activeSessionId}
          knowledgeBases={knowledgeBases}
          onSelectSession={onSelectSession}
          onNewChat={onNewChat}
          onClose={onClose}
        />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="关闭侧边栏"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[2px]"
          />
          <aside
            ref={mobileAsideRef}
            role="dialog"
            aria-modal="true"
            aria-label="导航与知识库"
            tabIndex={-1}
            className="animate-drawer-left absolute inset-y-0 left-0 flex w-[286px] flex-col border-r border-border bg-surface shadow-pop outline-none"
          >
            <SidebarContent
              mode={mode}
              activeSection={activeSection}
              sessions={sessions}
              activeSessionId={activeSessionId}
              knowledgeBases={knowledgeBases}
              onSelectSession={onSelectSession}
              onNewChat={onNewChat}
              onClose={onClose}
              showClose
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}

interface SidebarContentProps extends Omit<SidebarProps, "mobileOpen"> {
  showClose?: boolean;
}

function SidebarContent({
  mode,
  activeSection = "knowledge",
  sessions = [],
  activeSessionId = "",
  knowledgeBases = [],
  onSelectSession,
  onNewChat,
  onClose,
  showClose = false,
}: SidebarContentProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-3">
        <LogoMark />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight">PiChat</p>
          <p className="truncate text-[11px] text-subtle">企业知识库 Agent</p>
        </div>
        {showClose ? (
          <IconButton label="关闭侧边栏" icon="x" onClick={onClose} className="lg:hidden" />
        ) : null}
      </div>

      <WorkspaceSwitch mode={mode} onClose={onClose} />

      {mode === "chat" ? (
        <ChatNav
          sessions={sessions}
          activeSessionId={activeSessionId}
          knowledgeBases={knowledgeBases}
          onSelectSession={onSelectSession}
          onNewChat={onNewChat}
          onClose={onClose}
        />
      ) : (
        <ManageNav activeSection={activeSection} onClose={onClose} />
      )}

      <UserMenu />
    </div>
  );
}

function WorkspaceSwitch({ mode, onClose }: { mode: SidebarMode; onClose: () => void }) {
  return (
    <nav
      aria-label="工作区切换"
      className="mx-3 mt-2 grid shrink-0 grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1"
    >
      <Link
        href="/"
        onClick={onClose}
        aria-current={mode === "chat" ? "page" : undefined}
        className={cn(
          "flex h-9 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors duration-150",
          mode === "chat"
            ? "bg-surface text-fg shadow-card"
            : "text-muted hover:bg-surface hover:text-fg",
        )}
      >
        <Icon name="message-square" size={13} />
        对话
      </Link>
      <Link
        href="/knowledge"
        onClick={onClose}
        aria-current={mode === "manage" ? "page" : undefined}
        className={cn(
          "flex h-9 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors duration-150",
          mode === "manage"
            ? "bg-surface text-fg shadow-card"
            : "text-muted hover:bg-surface hover:text-fg",
        )}
      >
        <Icon name="settings" size={13} />
        管理
      </Link>
    </nav>
  );
}

interface ChatNavProps {
  sessions: Session[];
  activeSessionId: string;
  knowledgeBases: KnowledgeBase[];
  onSelectSession?: (id: string) => void;
  onNewChat?: () => void;
  onClose: () => void;
}

function ChatNav({
  sessions,
  activeSessionId,
  knowledgeBases,
  onSelectSession,
  onNewChat,
  onClose,
}: ChatNavProps) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const kbHeadingId = useId();

  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? sessions.filter((session) => session.title.toLowerCase().includes(normalized))
    : sessions;
  const groups = ["今天", "更早"] as const;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pt-3">
        <button
          type="button"
          onClick={() => {
            onNewChat?.();
            onClose();
          }}
          className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
        >
          <Icon name="plus" size={16} />
          新建对话
        </button>
      </div>

      <div className="shrink-0 px-3 pt-3">
        <div className="relative">
          <Icon
            name="search"
            size={15}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle"
          />
          <label htmlFor={searchId} className="sr-only">
            搜索对话
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索对话"
            className="h-9 w-full rounded-lg border border-border bg-surface-2 pr-2 pl-8 text-sm text-fg transition-colors placeholder:text-subtle focus:border-accent"
          />
        </div>
      </div>

      <nav aria-label="对话列表" className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs leading-5 text-subtle">
            没有匹配的对话
            <br />
            换个关键词试试
          </p>
        ) : (
          groups.map((group) => {
            const items = filtered.filter((session) => session.group === group);
            if (items.length === 0) {
              return null;
            }
            return (
              <div key={group} className="mb-3">
                <h3 className="px-2 pb-1 text-[11px] font-medium tracking-wider text-subtle">
                  {group}
                </h3>
                <ul className="space-y-0.5">
                  {items.map((session) => {
                    const active = session.id === activeSessionId;
                    return (
                      <li key={session.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectSession?.(session.id);
                            onClose();
                          }}
                          aria-current={active ? "true" : undefined}
                          title={session.title}
                          className={cn(
                            "group flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors duration-150 lg:min-h-0",
                            active
                              ? "bg-accent-soft text-fg"
                              : "text-muted hover:bg-surface-2 hover:text-fg",
                          )}
                        >
                          <Icon
                            name="message-square"
                            size={15}
                            className={
                              active ? "shrink-0 text-accent-text" : "shrink-0 text-subtle"
                            }
                          />
                          <span className="min-w-0 flex-1 truncate">{session.title}</span>
                          <span className="shrink-0 text-[10px] tabular-nums text-subtle">
                            {session.updatedLabel}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </nav>

      <section aria-labelledby={kbHeadingId} className="shrink-0 border-t border-border p-3">
        <div className="flex items-center justify-between px-1">
          <h2 id={kbHeadingId} className="text-[11px] font-medium tracking-wider text-subtle">
            可用知识库
          </h2>
          <span className="text-[11px] tabular-nums text-subtle">{knowledgeBases.length}</span>
        </div>
        <ul className="mt-2 space-y-0.5">
          {knowledgeBases.map((knowledgeBase) => (
            <li
              key={knowledgeBase.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted"
            >
              <Icon name="book-open" size={15} className="shrink-0 text-subtle" />
              <span className="min-w-0 flex-1 truncate">{knowledgeBase.name}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-subtle">
                {knowledgeBase.documentCount}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-start gap-1.5 px-2 text-[11px] leading-4 text-subtle">
          <Icon name="lock" size={12} className="mt-0.5 shrink-0" />
          仅显示已授权范围，权限变更后下一次提问生效
        </p>
      </section>
    </div>
  );
}

const adminNav = [
  {
    id: "knowledge",
    href: "/knowledge",
    label: "知识库",
    description: "文档、解析与默认访问",
    icon: "book-open",
  },
  {
    id: "permissions",
    href: "/permissions",
    label: "文档权限",
    description: "读取、拒绝与访问检查",
    icon: "shield-check",
  },
  {
    id: "members",
    href: "/members",
    label: "成员与组",
    description: "IdP 同步与角色",
    icon: "users",
  },
  {
    id: "audit",
    href: "/audit",
    label: "审计日志",
    description: "权限与管理变更",
    icon: "clipboard",
  },
] as const;

function ManageNav({
  activeSection,
  onClose,
}: {
  activeSection: AdminSection;
  onClose: () => void;
}) {
  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col px-3">
      <p className="shrink-0 px-2 pb-1.5 text-[11px] font-medium tracking-wider text-subtle">
        管理
      </p>
      <nav aria-label="管理导航" className="shrink-0">
        <ul className="space-y-1">
          {adminNav.map((item) => {
            const active = activeSection === item.id;
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors duration-150",
                    active
                      ? "bg-accent-soft text-fg"
                      : "text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
                      active ? "bg-accent text-accent-fg" : "bg-surface-2 text-subtle",
                    )}
                  >
                    <Icon name={item.icon} size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="mt-0.5 block text-[11px] text-subtle">{item.description}</span>
                  </span>
                  {active ? (
                    <Icon
                      name="chevron-right"
                      size={14}
                      className="mt-1 shrink-0 text-accent-text"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-4 shrink-0 rounded-xl border border-border bg-surface-2/60 p-3 text-[11px] leading-5 text-subtle">
        <p className="flex items-center gap-1.5 font-medium text-muted">
          <Icon name="users" size={12} />
          成员来源
        </p>
        <p className="mt-1">成员与用户组由企业 IdP 只读同步；权限变更会写入审计日志。</p>
      </div>
    </div>
  );
}
