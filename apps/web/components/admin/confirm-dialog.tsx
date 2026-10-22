"use client";

import { type ReactNode, useEffect, useId, useState } from "react";
import { useFocusTrap } from "../use-focus-trap";
import { Button, inputClass } from "./ui";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  requireText?: string;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "确认",
  tone = "primary",
  requireText,
  children,
}: ConfirmDialogProps) {
  const panelRef = useFocusTrap(open, onClose);
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const [text, setText] = useState("");

  useEffect(() => {
    if (open) {
      setText("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const blocked = requireText ? text.trim() !== requireText : false;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="关闭对话框"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-950/50 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="animate-message-enter relative w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-pop outline-none"
      >
        <h2 id={titleId} className="text-base font-semibold tracking-tight text-fg">
          {title}
        </h2>
        <p id={descriptionId} className="mt-1.5 text-sm leading-6 text-muted">
          {description}
        </p>
        {children ? <div className="mt-3">{children}</div> : null}
        {requireText ? (
          <div className="mt-3">
            <label htmlFor={inputId} className="text-xs font-medium text-fg">
              输入 <span className="font-mono text-danger">{requireText}</span> 以确认
            </label>
            <input
              id={inputId}
              value={text}
              onChange={(event) => setText(event.target.value)}
              autoComplete="off"
              className={`${inputClass} mt-1.5`}
            />
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={blocked}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
