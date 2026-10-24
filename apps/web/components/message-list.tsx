"use client";

import {
  Children,
  type ComponentProps,
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import Markdown, { type Components } from "react-markdown";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkCjkFriendlyGfmStrikethrough from "remark-cjk-friendly-gfm-strikethrough";
import remarkGfm from "remark-gfm";
import type { ChatMessage, Citation, ToolCall } from "@/lib/chat-data";
import { cn, formatTime } from "@/lib/utils";
import { Icon, LogoMark, Spinner } from "./icons";

interface MessageListProps {
  messages: ChatMessage[];
  selectedCitationId: string | null;
  onCitationSelect: (id: string) => void;
  onCitationPreview: (citation: Citation) => void;
  onRetry: () => void;
  busy: boolean;
}

export function MessageList({
  messages,
  selectedCitationId,
  onCitationSelect,
  onCitationPreview,
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
                  onCitationPreview={onCitationPreview}
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
  onCitationPreview: (citation: Citation) => void;
  onRetry: () => void;
  busy: boolean;
}

function AssistantMessage({
  message,
  selectedCitationId,
  onCitationSelect,
  onCitationPreview,
  onRetry,
  busy,
}: AssistantMessageProps) {
  const waiting = message.status === "thinking" && !message.content;

  return (
    <div className="flex flex-col">
      <div className="flex gap-3">
        <LogoMark />
        <div className="min-w-0 flex-1">
          <span className="sr-only">助手回答：</span>

          {message.thinking ? (
            <ThinkingBlock thinking={message.thinking} active={message.status === "thinking"} />
          ) : null}

          {message.tools && message.tools.length > 0 ? (
            <ToolCallList tools={message.tools} />
          ) : null}

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
              onPreview={onCitationPreview}
            />
          ) : null}

          {message.content && message.status !== "thinking" ? (
            <MessageActions content={message.content} onRetry={onRetry} retryDisabled={busy} />
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-right text-[11px] tabular-nums text-subtle">
        <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
      </p>
    </div>
  );
}

function ThinkingBlock({ thinking, active }: { thinking: string; active: boolean }) {
  return (
    <details
      open={active ? true : undefined}
      className="group rounded-lg border border-border bg-surface-2/60"
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

interface CitationInteraction {
  citations?: Citation[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}

const CitationInteractionContext = createContext<CitationInteraction | null>(null);

const remarkPlugins = [remarkGfm, remarkCjkFriendly, remarkCjkFriendlyGfmStrikethrough];

function MessageText({
  message,
  onCitationSelect,
  selectedCitationId,
}: {
  message: ChatMessage;
  onCitationSelect: (id: string) => void;
  selectedCitationId: string | null;
}) {
  const streaming = message.status === "streaming";

  return (
    <div
      className={cn(
        "message-markdown space-y-3 text-[15px] leading-7 text-fg",
        streaming && "markdown-streaming",
      )}
    >
      <CitationInteractionContext.Provider
        value={{
          citations: message.citations,
          onSelect: onCitationSelect,
          selectedId: selectedCitationId,
        }}
      >
        <Markdown remarkPlugins={remarkPlugins} components={markdownComponents}>
          {message.content}
        </Markdown>
      </CitationInteractionContext.Provider>
    </div>
  );
}

const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="whitespace-pre-wrap">
      <CitationChildren>{children}</CitationChildren>
    </p>
  ),
  h1: ({ children }) => (
    <h1 className="text-xl font-semibold leading-8 text-fg">
      <CitationChildren>{children}</CitationChildren>
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold leading-7 text-fg">
      <CitationChildren>{children}</CitationChildren>
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold leading-7 text-fg">
      <CitationChildren>{children}</CitationChildren>
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="font-semibold text-fg">
      <CitationChildren>{children}</CitationChildren>
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="font-semibold text-fg">
      <CitationChildren>{children}</CitationChildren>
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="font-semibold text-fg">
      <CitationChildren>{children}</CitationChildren>
    </h6>
  ),
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 marker:text-subtle">{children}</ul>,
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-5 marker:text-subtle">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="pl-0.5">
      <CitationChildren>{children}</CitationChildren>
    </li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border-strong pl-3 text-muted">
      <CitationChildren>{children}</CitationChildren>
    </blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent-text underline underline-offset-2 hover:text-accent-hover"
    >
      <CitationChildren>{children}</CitationChildren>
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-muted">{children}</del>,
  code: MarkdownCode,
  pre: MarkdownPre,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-surface-2 px-3 py-1.5 text-left font-medium">
      <CitationChildren>{children}</CitationChildren>
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-3 py-1.5 align-top">
      <CitationChildren>{children}</CitationChildren>
    </td>
  ),
  hr: () => <hr className="border-border" />,
};

function CitationChildren({ children }: { children?: ReactNode }) {
  const interaction = useContext(CitationInteractionContext);

  if (!interaction) {
    return <>{children}</>;
  }

  return (
    <>
      {withCitationMarkers(
        children,
        interaction.citations,
        interaction.onSelect,
        interaction.selectedId,
      )}
    </>
  );
}

function MarkdownCode({ className, children }: ComponentProps<"code">) {
  return (
    <code
      className={cn("rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-fg", className)}
    >
      {children}
    </code>
  );
}

function MarkdownPre({ children }: ComponentProps<"pre">) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border bg-surface p-4 font-mono text-[13px] leading-6 text-fg [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit">
      {children}
    </pre>
  );
}

function withCitationMarkers(
  children: ReactNode,
  citations: Citation[] | undefined,
  onSelect: (id: string) => void,
  selectedId: string | null,
): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      return (
        <CitationMarkers
          text={child}
          citations={citations}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      );
    }

    if (!isValidElement(child) || child.type === MarkdownCode || child.type === MarkdownPre) {
      return child;
    }

    const props = child.props as { children?: ReactNode };
    if (props.children === undefined) {
      return child;
    }

    return cloneElement(
      child as ReactElement<{ children?: ReactNode }>,
      undefined,
      withCitationMarkers(props.children, citations, onSelect, selectedId),
    );
  });
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

function CitationsRow({
  citations,
  selectedId,
  onSelect,
  onPreview,
}: {
  citations: Citation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPreview: (citation: Citation) => void;
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
            <div
              key={citation.id}
              className={cn(
                "inline-flex max-w-full items-center rounded-full border pr-0.5 transition-colors duration-150",
                selected
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(citation.id)}
                aria-pressed={selected}
                aria-label={`查看引用 ${citation.index}：${citation.documentTitle}`}
                title={`${citation.documentTitle} · ${citation.knowledgeBaseName}`}
                className="inline-flex max-w-full cursor-pointer items-center gap-1.5 py-1 pl-2.5"
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
                    selected ? "bg-accent text-accent-fg" : "bg-surface-2 text-subtle",
                  )}
                >
                  {citation.index}
                </span>
                <span className="max-w-[220px] truncate text-xs">{citation.documentTitle}</span>
              </button>
              <button
                type="button"
                onClick={() => onPreview(citation)}
                aria-label={`预览原文 ${citation.index}：${citation.documentTitle}`}
                title="查看原文"
                className="ml-0.5 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-subtle transition-colors hover:bg-surface hover:text-accent-text"
              >
                <Icon name="eye" size={11} />
              </button>
            </div>
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
