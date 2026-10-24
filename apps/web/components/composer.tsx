"use client";

import type { ThinkingLevel } from "@pichat/shared";
import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "./admin/toast";
import { Icon } from "./icons";
import { useModelConfig } from "./model-config/model-config-provider";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (thinkingLevel: ThinkingLevel) => void;
  onStop: () => void;
  streaming: boolean;
  knowledgeBaseCount: number;
  knowledgeBaseTotal: number;
  onOpenKnowledgeBasePicker: () => void;
  focusKey: number;
  webSearch: boolean;
  onWebSearchChange: (enabled: boolean) => void;
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
  knowledgeBaseTotal,
  onOpenKnowledgeBasePicker,
  focusKey,
  webSearch,
  onWebSearchChange,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const webSearchRef = useRef<HTMLButtonElement>(null);
  const modelMeasureRef = useRef<HTMLSpanElement>(null);
  const lastWheelAtRef = useRef(0);
  const { chatConfigs, defaultConfigId, setDefaultConfig } = useModelConfig();
  const { showToast } = useToast();
  const [thinking, setThinking] = useState("medium");
  const [modelSelectWidth, setModelSelectWidth] = useState<number | null>(null);
  const modelId = useId();
  const thinkingId = useId();

  const activeModelId = defaultConfigId ?? chatConfigs[0]?.id ?? "none";
  const activeModelLabel =
    chatConfigs.find((config) => config.id === activeModelId)?.displayName ?? "尚未配置模型";

  useLayoutEffect(() => {
    const span = modelMeasureRef.current;
    if (!span) {
      return;
    }
    const update = () => {
      const width = span.offsetWidth;
      if (width > 0) {
        setModelSelectWidth(width);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(span);
    return () => observer.disconnect();
  }, []);

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

  useEffect(() => {
    const button = webSearchRef.current;
    if (!button) {
      return;
    }
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) {
        return;
      }
      event.preventDefault();
      const now = Date.now();
      if (now - lastWheelAtRef.current < 300) {
        return;
      }
      lastWheelAtRef.current = now;
      const next = event.deltaY > 0;
      if (next !== webSearch) {
        onWebSearchChange(next);
      }
    };
    button.addEventListener("wheel", handleWheel, { passive: false });
    return () => button.removeEventListener("wheel", handleWheel);
  }, [onWebSearchChange, webSearch]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSend(thinking as ThinkingLevel);
    }
  }

  const canSend = value.trim().length > 0 && !streaming;
  const knowledgeBaseLabel =
    knowledgeBaseTotal === 0
      ? "无可用知识库"
      : knowledgeBaseCount === 0
        ? "未选择知识库"
        : knowledgeBaseCount === knowledgeBaseTotal
          ? `全部 ${knowledgeBaseTotal} 个知识库`
          : `已选 ${knowledgeBaseCount}/${knowledgeBaseTotal} 个知识库`;

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
            className="max-h-[200px] min-h-16 w-full resize-none bg-transparent px-2.5 py-2 text-base leading-6 text-fg outline-none placeholder:text-subtle sm:text-[15px]"
          />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1 pt-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => showToast("附件上传即将支持", "neutral")}
                aria-label="添加附件"
                title="添加附件（即将支持）"
                className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md bg-transparent text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 sm:h-7 sm:w-7"
              >
                <Icon name="paperclip" size={17} strokeWidth={1.8} />
              </button>
              <div className="relative shrink-0">
                <span
                  ref={modelMeasureRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-0 invisible select-none whitespace-pre pl-2 text-base sm:pl-1.5 sm:text-[11px] pr-6 sm:pr-5"
                >
                  {activeModelLabel}
                </span>
                <label htmlFor={modelId} className="sr-only">
                  选择模型
                </label>
                <select
                  id={modelId}
                  value={chatConfigs.length > 0 ? activeModelId : "none"}
                  onChange={(event) => {
                    if (event.target.value !== "none") {
                      void setDefaultConfig(event.target.value).catch(() => {
                        showToast("切换默认模型失败，请稍后重试", "danger");
                      });
                    }
                  }}
                  disabled={chatConfigs.length === 0}
                  title={
                    activeModelLabel === "尚未配置模型"
                      ? "在左下角账号菜单中配置模型"
                      : activeModelLabel
                  }
                  style={modelSelectWidth !== null ? { width: `${modelSelectWidth}px` } : undefined}
                  className={cn(
                    "h-11 w-[9rem] cursor-pointer appearance-none rounded-md bg-transparent pr-6 pl-2 text-base text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg sm:h-7 sm:w-[8.5rem] sm:pr-5 sm:pl-1.5 sm:text-[11px]",
                    chatConfigs.length === 0 && "cursor-not-allowed opacity-60",
                  )}
                >
                  {chatConfigs.length === 0 ? (
                    <option value="none">尚未配置模型</option>
                  ) : (
                    chatConfigs.map((config) => (
                      <option key={config.id} value={config.id}>
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
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button
                ref={webSearchRef}
                type="button"
                role="switch"
                aria-checked={webSearch}
                aria-label="联网搜索"
                title={`联网搜索：${webSearch ? "开" : "关"}（悬停时滚轮向下开、向上关）`}
                onClick={() => onWebSearchChange(!webSearch)}
                className={cn(
                  "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-base transition-colors duration-150 sm:h-7 sm:text-[11px]",
                  webSearch
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border bg-surface-2 text-muted hover:text-fg",
                )}
              >
                <Icon name="globe" size={12} />
                <span className="hidden sm:inline">联网搜索</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative h-3.5 w-6 rounded-full transition-colors duration-150",
                    webSearch ? "bg-accent" : "bg-border-strong",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 size-2.5 rounded-full bg-surface transition-transform duration-150",
                      webSearch && "translate-x-2.5",
                    )}
                  />
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenKnowledgeBasePicker}
                disabled={knowledgeBaseTotal === 0}
                aria-haspopup="dialog"
                aria-label={`选择知识库，${knowledgeBaseLabel}`}
                title="选择本次会话检索的知识库"
                className={cn(
                  "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 text-base font-medium text-muted transition-colors hover:bg-surface hover:text-fg sm:h-7 sm:text-[11px]",
                  knowledgeBaseTotal === 0 && "cursor-not-allowed opacity-50",
                )}
              >
                <Icon name="database" size={12} className="text-subtle" />
                <span className="hidden sm:inline">{knowledgeBaseLabel}</span>
                <span className="sm:hidden">
                  {knowledgeBaseCount}/{knowledgeBaseTotal}
                </span>
                <Icon name="chevron-down" size={10} className="text-subtle" />
              </button>

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
                  onClick={() => onSend(thinking as ThinkingLevel)}
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
          <span>
            {webSearch
              ? "联网搜索已开启：外部网页内容仅供参考，请核实来源。"
              : knowledgeBaseTotal === 0
                ? "当前账号没有可读知识库，回答不会包含企业文档。"
                : knowledgeBaseCount === 0
                  ? "未选择知识库：本次只做通用回答，不检索企业文档。"
                  : "回答基于所选知识库，可能存在遗漏，请以引用原文为准。"}
          </span>
          <span className="hidden sm:inline">Enter 发送 · Shift + Enter 换行</span>
        </p>
      </div>
    </div>
  );
}
