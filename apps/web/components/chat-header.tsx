"use client";

import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { IconButton } from "./ui";

interface ChatHeaderProps {
  title: string;
  hasMessages: boolean;
  status: "idle" | "thinking" | "streaming";
  sidebarOpen: boolean;
  citationsOpen: boolean;
  onOpenSidebar: () => void;
  onOpenCitations: () => void;
}

export function ChatHeader({
  title,
  hasMessages,
  status,
  sidebarOpen,
  citationsOpen,
  onOpenSidebar,
  onOpenCitations,
}: ChatHeaderProps) {
  const busy = status !== "idle";
  const statusText =
    status === "thinking"
      ? "正在检索知识库…"
      : status === "streaming"
        ? "正在生成回答…"
        : hasMessages
          ? "引用可追溯 · 权限已生效"
          : "仅检索你有权阅读的文档";

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
      <IconButton
        label="打开侧边栏"
        icon="menu"
        onClick={onOpenSidebar}
        aria-expanded={sidebarOpen}
        className="lg:hidden"
      />

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-medium text-fg">{title}</h1>
        <p className="flex items-center gap-1.5 text-[11px] text-subtle">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              busy ? "animate-pulse bg-accent" : "bg-subtle",
            )}
          />
          <span className="truncate">{statusText}</span>
        </p>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {status === "thinking"
          ? "正在检索知识库"
          : status === "streaming"
            ? "正在生成回答"
            : "回答已就绪"}
      </p>

      <div className="flex shrink-0 items-center gap-1.5">
        <IconButton
          label="打开引用面板"
          icon="quote"
          onClick={onOpenCitations}
          aria-expanded={citationsOpen}
          aria-haspopup="dialog"
          className="xl:hidden"
        />
        <ThemeToggle />
      </div>
    </header>
  );
}
