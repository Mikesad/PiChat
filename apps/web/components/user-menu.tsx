"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { roleLabels } from "@/lib/admin-data";
import { ConfirmDialog } from "./admin/confirm-dialog";
import { useToast } from "./admin/toast";
import { useAuth } from "./auth/auth-provider";
import { Icon } from "./icons";
import { useModelConfig } from "./model-config/model-config-provider";

export function UserMenu() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { activeConfig, openConfig } = useModelConfig();
  const { clearToasts } = useToast();
  const [open, setOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const name = user?.displayName ?? "未登录";
  const role = user ? roleLabels[user.role] : "—";
  const canConfigure = user?.role === "tenant_admin";

  useEffect(() => {
    if (!open) {
      return;
    }
    firstItemRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleOpenModelConfig() {
    setOpen(false);
    triggerRef.current?.focus();
    openConfig();
  }

  function handleOpenLogout() {
    setOpen(false);
    triggerRef.current?.focus();
    setLogoutOpen(true);
  }

  async function handleLogout() {
    clearToasts();
    await logout();
    setLogoutOpen(false);
    router.replace("/login");
  }

  return (
    <div ref={wrapperRef} className="relative mt-auto shrink-0 border-t border-border p-3">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="账号菜单"
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors duration-150 hover:bg-surface-2"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-fg">
          {name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-[11px] text-subtle">{role}</p>
        </div>
        <Icon
          name="chevron-up"
          size={15}
          className={
            open
              ? "shrink-0 rotate-180 text-subtle transition-transform duration-150"
              : "shrink-0 text-subtle transition-transform duration-150"
          }
        />
      </button>

      {open ? (
        <div
          id={menuId}
          className="animate-message-enter absolute right-0 bottom-full left-0 z-20 mb-2 rounded-xl border border-border bg-surface p-1 shadow-pop"
        >
          {canConfigure ? (
            <button
              ref={firstItemRef}
              type="button"
              onClick={handleOpenModelConfig}
              className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 hover:bg-surface-2"
            >
              <Icon name="settings" size={15} className="mt-0.5 shrink-0 text-subtle" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-fg">模型配置</span>
                <span className="mt-0.5 block truncate text-[11px] text-subtle">
                  {activeConfig?.displayName ?? "未配置模型"}
                </span>
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleOpenLogout}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-danger transition-colors duration-150 hover:bg-danger-soft"
          >
            <Icon name="log-out" size={15} className="shrink-0" />
            退出登录
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={handleLogout}
        title="退出登录？"
        description="当前会话将结束，并返回登录页面。模型配置保存在服务端账号下。"
        confirmLabel="退出登录"
        tone="danger"
      />
    </div>
  );
}
