"use client";

import type { Citation } from "@/lib/chat-data";
import { cn } from "@/lib/utils";
import { Icon } from "./icons";
import { IconButton } from "./ui";

interface CitationsPanelProps {
  citations: Citation[];
  candidates?: Citation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPreview: (citation: Citation) => void;
  onClose?: () => void;
  pending?: boolean;
  className?: string;
}

const skeletonKeys = ["skeleton-1", "skeleton-2", "skeleton-3"];

export function CitationsPanel({
  citations,
  candidates = [],
  selectedId,
  onSelect,
  onPreview,
  onClose,
  pending = false,
  className,
}: CitationsPanelProps) {
  const candidateCount = candidates.length;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-bg", className)}>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <Icon name="quote" size={16} className="text-subtle" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">引用与来源</h2>
        <span
          className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted"
          title={`${citations.length} 条回答引用，${candidateCount} 个检索候选`}
        >
          {citations.length}
        </span>
        {onClose ? (
          <IconButton label="关闭引用面板" icon="x" onClick={onClose} className="xl:hidden" />
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {pending && citations.length === 0 && candidateCount === 0 ? (
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
        ) : null}

        {citations.length > 0 ? (
          <ul className="space-y-2">
            {citations.map((citation) => (
              <CitationCard
                key={citation.id}
                citation={citation}
                selected={citation.id === selectedId}
                onSelect={onSelect}
                onPreview={onPreview}
              />
            ))}
          </ul>
        ) : null}

        {citations.length === 0 && candidateCount > 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface/60 px-4 py-6 text-center">
            <p className="text-sm font-medium text-fg">
              {pending ? "正在检索引用" : "本次回答未引用检索结果"}
            </p>
            <p className="mt-1 text-xs leading-5 text-subtle">
              {pending
                ? "检索到的片段先作为候选展示，回答完成后会标记是否被引用。"
                : "检索到的片段保留在下方「检索候选」中，可展开核对。"}
            </p>
          </div>
        ) : null}

        {citations.length === 0 && candidateCount === 0 && !pending ? (
          <div className="flex h-full flex-col items-center justify-center px-4 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-subtle">
              <Icon name="quote" size={18} />
            </span>
            <p className="mt-3 text-sm font-medium text-fg">还没有引用</p>
            <p className="mt-1 text-xs leading-5 text-subtle">
              回答生成后，被回答采用的文档、片段与所属知识库会显示在这里。
            </p>
          </div>
        ) : null}

        {candidateCount > 0 ? (
          <details className="group mt-3 rounded-xl border border-border bg-surface">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-muted transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
              <Icon name="search" size={13} className="shrink-0 text-subtle" />
              <span className="font-medium">检索候选</span>
              <span className="rounded-full bg-surface-2 px-1.5 text-[10px] font-medium tabular-nums text-subtle">
                {candidateCount}
              </span>
              <span className="ml-auto text-[11px] text-subtle">
                {pending ? "等待回答引用" : "未被回答引用"}
              </span>
              <Icon
                name="chevron-down"
                size={13}
                className="shrink-0 transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <ul className="space-y-2 border-t border-border p-2">
              {candidates.map((citation) => (
                <CitationCard
                  key={citation.id}
                  citation={citation}
                  selected={citation.id === selectedId}
                  onSelect={onSelect}
                  onPreview={onPreview}
                  candidate
                />
              ))}
            </ul>
          </details>
        ) : null}
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

function CitationCard({
  citation,
  selected,
  onSelect,
  onPreview,
  candidate = false,
}: {
  citation: Citation;
  selected: boolean;
  onSelect: (id: string) => void;
  onPreview: (citation: Citation) => void;
  candidate?: boolean;
}) {
  return (
    <li>
      <div
        className={cn(
          "rounded-xl border p-3 transition-colors duration-150",
          selected
            ? "border-accent bg-accent-soft"
            : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
        )}
      >
        <button
          type="button"
          onClick={() => onSelect(citation.id)}
          aria-pressed={selected}
          aria-label={`查看${candidate ? "检索候选" : "引用"} ${citation.index}：${citation.documentTitle}`}
          className="w-full cursor-pointer text-left"
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
              <p className="text-sm leading-5 font-medium text-fg">{citation.documentTitle}</p>
              <p className="mt-0.5 text-[11px] text-subtle">
                {citation.knowledgeBaseName} · {citation.chunkId}
              </p>
            </div>
          </div>
          <p className="mt-2 line-clamp-4 text-xs leading-5 text-muted">{citation.snippet}</p>
        </button>
        <div className="mt-2 flex items-center justify-between gap-2">
          {selected ? (
            <p className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-text">
              <Icon name="check" size={12} strokeWidth={2.25} />
              已选中
            </p>
          ) : candidate ? (
            <span className="text-[11px] text-subtle">未被回答引用</span>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => onPreview(citation)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-surface hover:text-accent-text"
          >
            <Icon name="eye" size={12} />
            查看原文
          </button>
        </div>
      </div>
    </li>
  );
}
