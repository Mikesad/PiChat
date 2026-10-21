"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { LogoMark, Spinner } from "../icons";
import { useAuth } from "./auth-provider";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!user && !isLogin) {
      router.replace("/login");
    } else if (user && isLogin) {
      router.replace("/");
    }
  }, [ready, user, isLogin, router]);

  if (!ready || (!user && !isLogin) || (user && isLogin)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg text-fg">
        <LogoMark />
        <p className="text-sm text-muted">正在恢复会话…</p>
        <Spinner className="text-accent" />
      </div>
    );
  }

  return children;
}
