"use client";

import { useEffect, useState } from "react";
import type { ChatMessage, Citation, ToolCall } from "@/lib/chat-data";
import { cn, formatTime } from "@/lib/utils";
import { Icon, LogoMark, Spinner } from "./icons";

interface MessageListProps {
  messages: ChatMessage[];
  selectedCitationId: string | null;
  onCitationSelect: (id: string) => void;
  onRetry: () => void;
  busy: boolean;
}

export function MessageList({
  messages,
  selectedCitationId,
  onCitationSelect,
  onRetry,
  busy,
}: MessageListProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div role="log" aria-live="polite" aria-relevant="additions" aria-label="对话消息">
        <ol className="space-y-7">
          {messages.map((message) => (
            <li key={message.id} className="animate-message-enter">
              {message.role === "user" ? (
                <UserMessage message={message} />
              ) : (
                <AssistantMessage
                  message={message}
                  selectedCitationId={selectedCitationId}
                  onCitationSelect={onCitationSelect}
                  onRetry={onRetry}
                  busy={busy}
                />
              )}
            </li>
          ))}
        </ol>
      </div>
      <div className="h-4" />
    </div>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%]">
        <div className="rounded-2xl rounded-br-md border border-border bg-surface-2 px-4 py-2.5 text-[15px] leading-7 text-fg">
          <span className="sr-only">你提问：</span>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
        <p className="mt-1 text-right text-[11px] tabular-nums text-subtle">
          {formatTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

interface AssistantMessageProps {
  message: ChatMessage;
  selectedCitationId: string | null;
  onCitationSelect: (id: string) => void;
  onRetry: () => void;
  busy: boolean;
}

function AssistantMessage({
  message,
  selectedCitationId,
  onCitationSelect,
  onRetry,
  busy,
}: AssistantMessageProps) {
  const waiting = message.status === "thinking" && !message.content;

  return (
    <div className="flex gap-3">
      <LogoMark className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-sm font-medium text-fg">PiChat</p>
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-subtle">
            知识库 Agent
          </span>
          <time dateTime={message.createdAt} className="text-[11px] tabular-nums text-subtle">
            {formatTime(message.createdAt)}
          </time>
        </div>

        {message.thinking ? (
          <ThinkingBlock thinking={message.thinking} active={message.status === "thinking"} />
        ) : null}

        {message.tools && message.tools.length > 0 ? <ToolCallList tools={message.tools} /> : null}

        {message.content ? (
          <div className="mt-3">
            <MessageText
              message={message}
              onCitationSelect={onCitationSelect}
              selectedCitationId={selectedCitationId}
            />
          </div>
        ) : null}

        {waiting ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-subtle" role="status">
            <Spinner className="text-accent" />
            正在检索并组织答案…
          </p>
        ) : null}

        {message.status === "stopped" ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-warning">
            <Icon name="alert-circle" size={13} />
            已停止生成，可以重新发送或继续追问。
          </p>
        ) : null}

        {message.status === "error" ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-danger">
            <Icon name="alert-circle" size={13} />
            {message.error ?? "生成失败，请重试。"}
          </p>
        ) : null}

        {message.citations && message.citations.length > 0 ? (
          <CitationsRow
            citations={message.citations}
            selectedId={selectedCitationId}
            onSelect={onCitationSelect}
          />
        ) : null}

        {message.content && message.status !== "thinking" ? (
          <MessageActions content={message.content} onRetry={onRetry} retryDisabled={busy} />
        ) : null}
      </div>
    </div>
  );
}

function ThinkingBlock({ thinking, active }: { thinking: string; active: boolean }) {
  return (
    <details
      open={active ? true : undefined}
      className="group mt-2 rounded-lg border border-border bg-surface-2/60"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
        <Icon name="sparkles" size={13} className="shrink-0 text-accent-text" />
        <span className="font-medium">思考过程</span>
        <span className="text-subtle">{active ? "· 进行中" : "· 已完成"}</span>
        <Icon
          name="chevron-down"
          size={14}
          className="ml-auto shrink-0 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <p className="border-t border-border px-3 py-2.5 text-xs leading-6 text-muted">{thinking}</p>
    </details>
  );
}

function ToolCallList({ tools }: { tools: ToolCall[] }) {
  return (
    <ul className="mt-2 space-y-1.5" aria-label="工具调用">
      {tools.map((tool) => (
        <li
          key={tool.id}
          className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2"
        >
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-md",
              tool.status === "running"
                ? "bg-accent-soft text-accent-text"
                : tool.status === "error"
                  ? "bg-danger-soft text-danger"
                  : "bg-success-soft text-success",
            )}
          >
            {tool.status === "running" ? (
              <Spinner className="size-3" />
            ) : (
              <Icon
                name={tool.status === "error" ? "alert-circle" : "check"}
                size={13}
                strokeWidth={2.25}
              />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-xs font-medium text-fg">{tool.name}</span>
            <span className="block truncate text-[11px] text-subtle" title={tool.description}>
              {tool.description}
            </span>
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-subtle">
            {tool.status === "running"
              ? "运行中"
              : tool.status === "error"
                ? "失败"
                : tool.durationMs
                  ? `${tool.durationMs}ms`
                  : "完成"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MessageText({
  message,
  onCitationSelect,
  selectedCitationId,
}: {
  message: ChatMessage;
  onCitationSelect: (id: string) => void;
  selectedCitationId: string | null;
}) {
  const blocks = splitBlocks(message.content);
  const streaming = message.status === "streaming";

  return (
    <div className="space-y-3 text-[15px] leading-7 text-fg">
      {blocks.map((block, blockIndex) => {
        const isLastBlock = blockIndex === blocks.length - 1;
        const showCaret = streaming && isLastBlock;
        const lines = block.text.split("\n");
        const isList = lines.every((line) => line.startsWith("- "));

        if (isList) {
          return (
            <ul key={block.key} className="list-disc space-y-1 pl-5 marker:text-subtle">
              {lines.map((line, lineIndex) => (
                <li key={line} className="pl-0.5">
                  <CitationMarkers
                    text={line.slice(2)}
                    citations={message.citations}
                    onSelect={onCitationSelect}
                    selectedId={selectedCitationId}
                  />
                  {showCaret && lineIndex === lines.length - 1 ? <StreamingCaret /> : null}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={block.key} className="whitespace-pre-wrap">
            <CitationMarkers
              text={block.text}
              citations={message.citations}
              onSelect={onCitationSelect}
              selectedId={selectedCitationId}
            />
            {showCaret ? <StreamingCaret /> : null}
          </p>
        );
      })}
    </div>
  );
}

function StreamingCaret() {
  return <span aria-hidden="true" className="streaming-caret" />;
}

interface Token {
  key: string;
  text: string;
  citationIndex?: number;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match = pattern.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      tokens.push({ key: `t-${lastIndex}`, text: text.slice(lastIndex, match.index) });
    }
    tokens.push({
      key: `c-${match.index}`,
      text: match[0],
      citationIndex: Number(match[1]),
    });
    lastIndex = match.index + match[0].length;
    match = pattern.exec(text);
  }

  if (lastIndex < text.length) {
    tokens.push({ key: `t-${lastIndex}`, text: text.slice(lastIndex) });
  }

  return tokens;
}

function CitationMarkers({
  text,
  citations,
  onSelect,
  selectedId,
}: {
  text: string;
  citations?: Citation[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  return (
    <>
      {tokenize(text).map((token) => {
        if (token.citationIndex === undefined) {
          return <span key={token.key}>{token.text}</span>;
        }

        const citation = citations?.find((item) => item.index === token.citationIndex);
        if (!citation) {
          return <span key={token.key}>{token.text}</span>;
        }

        const selected = citation.id === selectedId;
        return (
          <button
            key={token.key}
            type="button"
            onClick={() => onSelect(citation.id)}
            aria-label={`查看引用 ${citation.index}：${citation.documentTitle}`}
            aria-pressed={selected}
            title={citation.documentTitle}
            className={cn(
              "mx-0.5 inline-flex h-[18px] min-w-[18px] cursor-pointer items-center justify-center rounded px-1 align-super text-[10px] font-semibold tabular-nums transition-colors duration-150",
              selected
                ? "bg-accent text-accent-fg"
                : "bg-accent-soft text-accent-text hover:bg-accent hover:text-accent-fg",
            )}
          >
            {citation.index}
          </button>
        );
      })}
    </>
  );
}

function splitBlocks(content: string) {
  const blocks: Array<{ key: string; text: string }> = [];
  const pattern = /\n{2,}/g;
  let lastIndex = 0;
  let match = pattern.exec(content);

  while (match) {
    if (match.index > lastIndex) {
      blocks.push({ key: `b-${lastIndex}`, text: content.slice(lastIndex, match.index) });
    }
    lastIndex = match.index + match[0].length;
    match = pattern.exec(content);
  }

  if (lastIndex < content.length) {
    blocks.push({ key: `b-${lastIndex}`, text: content.slice(lastIndex) });
  }

  return blocks;
}

function CitationsRow({
  citations,
  selectedId,
  onSelect,
}: {
  citations: Citation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-subtle">
        <Icon name="quote" size={12} />
        引用来源
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {citations.map((citation) => {
          const selected = citation.id === selectedId;
          return (
            <button
              key={citation.id}
              type="button"
              onClick={() => onSelect(citation.id)}
              aria-pressed={selected}
              title={`${citation.documentTitle} · ${citation.knowledgeBaseName}`}
              className={cn(
                "inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150",
                selected
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg",
              )}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
                  selected ? "bg-accent text-accent-fg" : "bg-surface-2 text-subtle",
                )}
              >
                {citation.index}
              </span>
              <span className="max-w-[220px] truncate">{citation.documentTitle}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MessageActions({
  content,
  onRetry,
  retryDisabled,
}: {
  content: string;
  onRetry: () => void;
  retryDisabled: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-1">
      <button
        type="button"
        onClick={copyAnswer}
        aria-label={copied ? "已复制回答" : "复制回答"}
        title={copied ? "已复制" : "复制"}
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-lg text-subtle sm:size-9 transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
      >
        <Icon name={copied ? "check" : "copy"} size={15} />
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? "回答已复制到剪贴板" : ""}
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={retryDisabled}
        aria-label="重新生成回答"
        title="重新生成"
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-lg text-subtle sm:size-9 transition-colors duration-150 hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Icon name="refresh" size={15} />
      </button>
      <button
        type="button"
        onClick={() => setFeedback(feedback === "up" ? null : "up")}
        aria-label="回答有帮助"
        aria-pressed={feedback === "up"}
        title="有帮助"
        className={cn(
          "inline-flex size-11 cursor-pointer items-center justify-center rounded-lg text-subtle sm:size-9 transition-colors duration-150 hover:bg-surface-2 hover:text-fg",
          feedback === "up" && "bg-accent-soft text-accent-text hover:bg-accent-soft",
        )}
      >
        <Icon name="thumb-up" size={15} />
      </button>
      <button
        type="button"
        onClick={() => setFeedback(feedback === "down" ? null : "down")}
        aria-label="回答没有帮助"
        aria-pressed={feedback === "down"}
        title="没有帮助"
        className={cn(
          "inline-flex size-11 cursor-pointer items-center justify-center rounded-lg text-subtle sm:size-9 transition-colors duration-150 hover:bg-surface-2 hover:text-fg",
          feedback === "down" && "bg-accent-soft text-accent-text hover:bg-accent-soft",
        )}
      >
        <Icon name="thumb-down" size={15} />
      </button>
    </div>
  );
}
