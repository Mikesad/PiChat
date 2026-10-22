"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon, Spinner } from "./icons";
import { IconButton } from "./ui";
import { useFocusTrap } from "./use-focus-trap";

type PreviewStatus = "loading" | "ready" | "error";
type PreviewKind = "pdf" | "markdown" | "text" | "docx" | "unsupported";

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index).toLowerCase() : "";
}

function previewKind(fileName: string): PreviewKind {
  switch (extensionOf(fileName)) {
    case ".pdf":
      return "pdf";
    case ".md":
      return "markdown";
    case ".txt":
      return "text";
    case ".docx":
      return "docx";
    default:
      return "unsupported";
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      typeof (body as { message?: unknown }).message === "string"
    ) {
      return (body as { message: string }).message;
    }
  } catch {
    // The response is not JSON; fall back to a status-based message.
  }
  return `无法加载文档（${response.status}）`;
}

export interface DocumentPreviewTarget {
  documentId: string;
  title: string;
  sizeLabel?: string | null;
}

export function DocumentPreviewDialog({
  documentId,
  title,
  sizeLabel,
  onClose,
}: DocumentPreviewTarget & { onClose: () => void }) {
  const panelRef = useFocusTrap(true, onClose);
  const titleId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<PreviewStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const kind = previewKind(title);
  const contentUrl = `/api/documents/${encodeURIComponent(documentId)}/content`;

  useEffect(() => {
    if (kind === "pdf" || kind === "unsupported") {
      setStatus("ready");
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    setText("");

    async function load() {
      try {
        const response = await fetch(contentUrl, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        if (kind === "markdown" || kind === "text") {
          setText(await response.text());
        } else {
          const buffer = await response.arrayBuffer();
          const container = contentRef.current;
          if (!container) {
            throw new Error("预览容器未就绪");
          }
          container.replaceChildren();
          const { renderAsync } = await import("docx-preview");
          await renderAsync(buffer, container, styleRef.current ?? undefined, {
            className: "docx",
            inWrapper: true,
            breakPages: true,
            ignoreLastRenderedPageBreak: true,
            useBase64URL: true,
          });
        }

        if (!controller.signal.aborted) {
          setStatus("ready");
        }
      } catch (cause) {
        if (controller.signal.aborted) {
          return;
        }
        setError(cause instanceof Error && cause.message ? cause.message : "无法加载文档");
        setStatus("error");
      }
    }

    void load();
    return () => {
      controller.abort();
      contentRef.current?.replaceChildren();
    };
  }, [contentUrl, kind]);

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label="关闭预览"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-x-2 inset-y-3 flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-pop outline-none sm:inset-x-6 sm:inset-y-6 lg:inset-x-12"
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-subtle">
            <Icon name="file-text" size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-sm font-semibold text-fg sm:text-base">
              {title}
            </h2>
            <p className="mt-0.5 text-[11px] text-subtle">
              {sizeLabel ? `${sizeLabel} · ` : ""}
              {kindLabel(kind)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.open(contentUrl, "_blank", "noopener,noreferrer")}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-fg transition-colors hover:bg-surface-2"
          >
            <Icon name="external-link" size={13} />
            新窗口
          </button>
          <IconButton label="关闭预览" icon="x" onClick={onClose} />
        </div>

        <div className="relative min-h-0 flex-1 bg-surface-2/60">
          {kind === "pdf" ? (
            <iframe
              src={contentUrl}
              title={`预览 ${title}`}
              className="size-full border-0 bg-white"
            />
          ) : kind === "unsupported" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-surface text-subtle">
                <Icon name="file-text" size={20} />
              </span>
              <p className="text-sm font-medium text-fg">该格式暂不支持在线预览</p>
              <p className="max-w-sm text-xs leading-5 text-muted">
                可点击「新窗口」打开原文件，或下载后使用本地应用查看。
              </p>
            </div>
          ) : status === "error" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger">
                <Icon name="alert-circle" size={20} />
              </span>
              <p className="text-sm font-medium text-fg">文档加载失败</p>
              <p className="max-w-sm text-xs leading-5 text-muted">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-fg transition-colors hover:bg-surface-2"
              >
                关闭
              </button>
            </div>
          ) : kind === "docx" ? (
            <div className="relative h-full overflow-auto p-2 sm:p-4">
              <div ref={styleRef} />
              <div ref={contentRef} className="docx-preview-root mx-auto" />
              {status === "loading" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-2/60">
                  <Spinner className="text-accent" />
                  <p className="text-xs text-muted">正在加载文档…</p>
                </div>
              ) : null}
            </div>
          ) : status === "loading" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Spinner className="text-accent" />
              <p className="text-xs text-muted">正在加载文档…</p>
            </div>
          ) : (
            <div className="h-full overflow-auto p-4 sm:p-6">
              <pre className="mx-auto max-w-4xl rounded-xl border border-border bg-surface p-4 font-mono text-xs leading-6 break-words whitespace-pre-wrap text-fg sm:p-6 sm:text-sm">
                {text || "（空文件）"}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function kindLabel(kind: PreviewKind): string {
  switch (kind) {
    case "pdf":
      return "PDF";
    case "markdown":
      return "Markdown 原文";
    case "text":
      return "纯文本";
    case "docx":
      return "Word 文档";
    default:
      return "未知格式";
  }
}
