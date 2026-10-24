"use client";

import { useId } from "react";
import { Icon } from "../icons";
import { useFocusTrap } from "../use-focus-trap";
import { Button } from "./ui";

interface AccessDeniedDialogProps {
  open: boolean;
  feature: string;
  roleLabel?: string;
  onClose: () => void;
}

export function AccessDeniedDialog({ open, feature, roleLabel, onClose }: AccessDeniedDialogProps) {
  const panelRef = useFocusTrap(open, onClose);
  const titleId = useId();
  const descriptionId = useId();

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
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
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning">
            <Icon name="lock" size={18} />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold tracking-tight text-fg">
              没有访问「{feature}」的权限
            </h2>
            <p id={descriptionId} className="mt-1.5 text-sm leading-6 text-muted">
              该功能仅对租户管理员和安全管理员开放
              {roleLabel ? `，当前角色为${roleLabel}` : ""}。如需使用，请联系租户管理员调整角色。
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>知道了</Button>
        </div>
      </div>
    </div>
  );
}
