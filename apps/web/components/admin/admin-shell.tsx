"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Icon } from "@/components/icons";
import { type AdminSection, Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { IconButton } from "@/components/ui";
import { canViewAudit, canViewMembers, roleLabels } from "@/lib/admin-data";
import { AccessDeniedDialog } from "./access-denied-dialog";

type RestrictedFeature = "members" | "audit";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deniedFeature, setDeniedFeature] = useState<RestrictedFeature | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const displayName = user?.displayName ?? "未登录";
  const roleLabel = user ? roleLabels[user.role] : "—";
  const restrictedSection: RestrictedFeature | null = user
    ? pathname.startsWith("/members") && !canViewMembers(user.role)
      ? "members"
      : pathname.startsWith("/audit") && !canViewAudit(user.role)
        ? "audit"
        : null
    : null;

  const activeSection: AdminSection = pathname.startsWith("/permissions")
    ? "permissions"
    : pathname.startsWith("/models")
      ? "models"
      : pathname.startsWith("/search")
        ? "search"
        : pathname.startsWith("/toolbox")
          ? "toolbox"
          : pathname.startsWith("/members")
            ? "members"
            : pathname.startsWith("/audit")
              ? "audit"
              : "knowledge";
  const sectionLabels: Record<AdminSection, string> = {
    knowledge: "知识库",
    permissions: "文档权限",
    models: "模型配置",
    search: "搜索引擎",
    toolbox: "工具箱",
    members: "部门成员",
    audit: "审计日志",
  };
  const sectionLabel = sectionLabels[activeSection];

  const openSidebar = useCallback(() => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSidebarOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    window.requestAnimationFrame(() => target?.focus());
  }, []);

  useEffect(() => {
    if (!sidebarOpen) {
      return;
    }
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        closeSidebar();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen, closeSidebar]);

  useEffect(() => {
    if (!restrictedSection) {
      return;
    }
    setDeniedFeature(restrictedSection);
    router.replace("/knowledge");
  }, [restrictedSection, router]);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-fg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-pop"
      >
        跳到主内容
      </a>

      <Sidebar
        mode="manage"
        activeSection={activeSection}
        userRole={user?.role}
        mobileOpen={sidebarOpen}
        onRestrictedFeature={setDeniedFeature}
        onClose={closeSidebar}
      />

      <div className="flex min-w-0 flex-1 flex-col" inert={sidebarOpen}>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
          <IconButton
            label="打开侧边栏"
            icon="menu"
            onClick={openSidebar}
            aria-expanded={sidebarOpen}
            className="lg:hidden"
          />
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
            <span className="shrink-0 text-subtle">管理</span>
            <Icon name="chevron-right" size={14} className="shrink-0 text-subtle" />
            <span className="truncate font-medium text-fg">{sectionLabel}</span>
          </div>
          <ThemeToggle />
          <div className="ml-1 hidden items-center gap-2 border-l border-border pl-3 sm:flex">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-fg">
              {displayName.slice(0, 1)}
            </span>
            <div className="leading-tight">
              <p className="text-xs font-medium text-fg">{displayName}</p>
              <p className="text-[10px] text-subtle">{roleLabel}</p>
            </div>
          </div>
        </header>

        <main id="main-content" className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
            {restrictedSection ? null : children}
          </div>
        </main>
      </div>

      <AccessDeniedDialog
        open={deniedFeature !== null}
        feature={deniedFeature === "members" ? "部门成员" : "审计日志"}
        roleLabel={user ? roleLabels[user.role] : undefined}
        onClose={() => setDeniedFeature(null)}
      />
    </div>
  );
}
