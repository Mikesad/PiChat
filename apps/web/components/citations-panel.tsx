"use client";

import type { Citation } from "@/lib/chat-data";
import { cn } from "@/lib/utils";
import { Icon } from "./icons";
import { IconButton } from "./ui";

interface CitationsPanelProps {
  citations: Citation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose?: () => void;
  pending?: boolean;
  className?: string;
}

const skeletonKeys = ["skeleton-1", "skeleton-2", "skeleton-3"];

export function CitationsPanel({
  citations,
  selectedId,
  onSelect,
  onClose,
  pending = false,
  className,
}: CitationsPanelProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-bg", className)}>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <Icon name="quote" size={16} className="text-subtle" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">引用与来源</h2>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted">
          {citations.length}
        </span>
        {onClose ? (
          <IconButton label="关闭引用面板" icon="x" onClick={onClose} className="xl:hidden" />
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {pending && citations.length === 0 ? (
          <div aria-busy="true" className="space-y-2">
            <p className="sr-only" role="status">
              正在检索引用来源
            </p>
            {skeletonKeys.map((key) => (
              <div key={key} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex items-center gap-2">
                  <span className="size-5 shrink-0 animate-pulse rounded bg-surface-2" />
                  <span className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
                </div>
                <div className="mt-3 space-y-1.5">
                  <span className="block h-2.5 w-full animate-pulse rounded bg-surface-2" />
                  <span className="block h-2.5 w-5/6 animate-pulse rounded bg-surface-2" />
                  <span className="block h-2.5 w-2/3 animate-pulse rounded bg-surface-2" />
                </div>
              </div>
            ))}
          </div>
        ) : citations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-subtle">
              <Icon name="quote" size={18} />
            </span>
            <p className="mt-3 text-sm font-medium text-fg">还没有引用</p>
            <p className="mt-1 text-xs leading-5 text-subtle">
              回答生成后，引用的文档、片段与所属知识库会显示在这里。
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {citations.map((citation) => {
              const selected = citation.id === selectedId;
              return (
                <li key={citation.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(citation.id)}
                    aria-pressed={selected}
                    aria-label={`查看引用 ${citation.index}：${citation.documentTitle}`}
                    className={cn(
                      "w-full cursor-pointer rounded-xl border p-3 text-left transition-colors duration-150",
                      selected
                        ? "border-accent bg-accent-soft"
                        : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold tabular-nums",
                          selected ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
                        )}
                      >
                        {citation.index}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm leading-5 font-medium text-fg">
                          {citation.documentTitle}
                        </p>
                        <p className="mt-0.5 text-[11px] text-subtle">
                          {citation.knowledgeBaseName} · {citation.chunkId}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-4 text-xs leading-5 text-muted">
                      {citation.snippet}
                    </p>
                    {selected ? (
                      <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent-text">
                        <Icon name="check" size={12} strokeWidth={2.25} />
                        已选中
                      </p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
            <Icon name="lock" size={13} className="text-subtle" />
            权限范围
          </p>
          <p className="mt-1.5 text-[11px] leading-5 text-subtle">
            仅展示当前账号有权阅读的文档。权限变更后，下一次提问立即生效。
          </p>
        </div>
      </div>
    </div>
  );
}
