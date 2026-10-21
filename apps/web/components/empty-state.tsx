"use client";

import type { KnowledgeBase } from "@/lib/chat-data";
import { Icon, type IconName } from "./icons";

interface EmptyStateProps {
  knowledgeBases: KnowledgeBase[];
  onSuggestion: (text: string) => void;
}

const suggestions: Array<{ icon: IconName; kicker: string; text: string }> = [
  { icon: "shield-check", kicker: "内部制度", text: "出差住宿报销标准是多少？" },
  { icon: "clock", kicker: "内部制度", text: "报销单最晚需要在什么时候提交？" },
  { icon: "clipboard", kicker: "内部制度", text: "超标准住宿需要经过谁审批？" },
  { icon: "refresh", kicker: "版本对比", text: "对比差旅制度 2025 与 2026 版的关键变化" },
];

export function EmptyState({ knowledgeBases, onSuggestion }: EmptyStateProps) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-4 py-6 sm:px-6 sm:py-16">
      <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-accent-text uppercase">
        <Icon name="sparkles" size={14} />
        Knowledge Agent
      </p>
      <h2 className="mt-3 text-2xl leading-tight font-semibold tracking-tight text-balance text-fg sm:text-3xl">
        从你有权限的知识库开始提问
      </h2>
      <p className="mt-2.5 max-w-xl text-sm leading-6 text-muted">
        回答会标注引用来源与工具调用，未授权的文档不会进入检索范围。
      </p>

      <div className="mt-6 grid gap-2.5 sm:mt-7 sm:grid-cols-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.text}
            type="button"
            onClick={() => onSuggestion(suggestion.text)}
            className="group flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-3.5 text-left transition-colors duration-150 hover:border-accent-soft-border hover:bg-surface-2"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-subtle transition-colors duration-150 group-hover:bg-accent-soft group-hover:text-accent-text">
              <Icon name={suggestion.icon} size={16} />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] text-subtle">{suggestion.kicker}</span>
              <span className="mt-0.5 block text-sm leading-5 text-fg">{suggestion.text}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 sm:mt-8">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-subtle">
          <Icon name="lock" size={12} />
          当前可检索
        </span>
        {knowledgeBases.map((knowledgeBase) => (
          <span
            key={knowledgeBase.id}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted"
          >
            {knowledgeBase.name}
            <span className="tabular-nums text-subtle">{knowledgeBase.documentCount}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
