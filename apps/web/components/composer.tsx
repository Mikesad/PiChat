"use client";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { ModelProviderId } from "@/lib/model-config";
import { cn } from "@/lib/utils";
import { Icon } from "./icons";
import { useModelConfig } from "./model-config/model-config-provider";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  knowledgeBaseCount: number;
  focusKey: number;
}

const thinkingLevels = [
  { value: "off", label: "思考：关" },
  { value: "low", label: "思考：低" },
  { value: "medium", label: "思考：中" },
  { value: "high", label: "思考：高" },
];

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  knowledgeBaseCount,
  focusKey,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { configs, defaultConfigId, setDefaultConfig } = useModelConfig();
  const [thinking, setThinking] = useState("medium");
  const modelId = useId();
  const thinkingId = useId();

  const activeModelId = defaultConfigId ?? configs[0]?.provider ?? "none";
  const activeModel = configs.find((config) => config.provider === activeModelId);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const hasValue = value.length > 0;
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 200);
    textarea.style.height = hasValue ? `${nextHeight}px` : "";
  }, [value]);

  useEffect(() => {
    if (focusKey > 0) {
      textareaRef.current?.focus();
    }
  }, [focusKey]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSend();
    }
  }

  const canSend = value.trim().length > 0 && !streaming;

  return (
    <div className="shrink-0 border-t border-border bg-bg/85 px-3 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border border-border-strong bg-surface p-2 shadow-card transition-shadow duration-150 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
          <label htmlFor="composer-input" className="sr-only">
            输入问题
          </label>
          <textarea
            id="composer-input"
            ref={textareaRef}
            rows={2}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-describedby="composer-hint"
            placeholder="输入问题，例如：出差住宿报销标准是多少？"
            className="max-h-[200px] min-h-14 w-full resize-none bg-transparent px-2.5 py-2 text-base leading-6 text-fg outline-none placeholder:text-subtle sm:text-[15px]"
          />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1 pt-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <div className="relative shrink-0">
                <label htmlFor={modelId} className="sr-only">
                  选择模型
                </label>
                <select
                  id={modelId}
                  value={configs.length > 0 ? activeModelId : "none"}
                  onChange={(event) => {
                    if (event.target.value !== "none") {
                      setDefaultConfig(event.target.value as ModelProviderId);
                    }
                  }}
                  disabled={configs.length === 0}
                  title={activeModel?.displayName ?? "在左下角账号菜单中配置模型"}
                  className={cn(
                    "h-11 w-[9rem] cursor-pointer appearance-none rounded-md bg-transparent pr-6 pl-2 text-base text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg sm:h-7 sm:w-[8.5rem] sm:pr-5 sm:pl-1.5 sm:text-[11px]",
                    configs.length === 0 && "cursor-not-allowed opacity-60",
                  )}
                >
                  {configs.length === 0 ? (
                    <option value="none">未配置模型</option>
                  ) : (
                    configs.map((config) => (
                      <option key={config.provider} value={config.provider}>
                        {config.displayName}
                      </option>
                    ))
                  )}
                </select>
                <Icon
                  name="chevron-down"
                  size={12}
                  className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-subtle"
                />
              </div>

              <div className="relative shrink-0">
                <label htmlFor={thinkingId} className="sr-only">
                  选择思考强度
                </label>
                <select
                  id={thinkingId}
                  value={thinking}
                  onChange={(event) => setThinking(event.target.value)}
                  title="选择思考强度"
                  className="h-11 w-[6.25rem] cursor-pointer appearance-none rounded-md bg-transparent pr-6 pl-2 text-base text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg sm:h-7 sm:w-[4.75rem] sm:pr-5 sm:pl-1.5 sm:text-[11px]"
                >
                  {thinkingLevels.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
                <Icon
                  name="chevron-down"
                  size={12}
                  className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-subtle"
                />
              </div>

              <span aria-hidden="true" className="mx-0.5 hidden h-3 w-px bg-border sm:block" />

              <span
                className="hidden h-7 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 text-[11px] font-medium text-muted sm:inline-flex"
                title="检索范围按当前账号权限自动过滤"
              >
                <Icon name="database" size={12} className="text-subtle" />
                {knowledgeBaseCount} 个知识库
                <Icon name="lock" size={11} className="text-subtle" />
              </span>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              {streaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-fg transition-colors duration-150 hover:bg-surface-2 sm:h-9"
                >
                  <Icon name="stop" size={12} />
                  停止
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!canSend}
                  aria-label="发送问题"
                  title="发送"
                  className={cn(
                    "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-accent text-accent-fg transition-colors duration-150 hover:bg-accent-hover sm:size-9",
                    !canSend && "cursor-not-allowed opacity-45 hover:bg-accent",
                  )}
                >
                  <Icon name="arrow-up" size={17} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </div>

        <p
          id="composer-hint"
          className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-[11px] leading-4 text-subtle"
        >
          <span>回答基于授权知识库，可能存在遗漏，请以引用原文为准。</span>
          <span className="hidden sm:inline">Enter 发送 · Shift + Enter 换行</span>
        </p>
      </div>
    </div>
  );
}
