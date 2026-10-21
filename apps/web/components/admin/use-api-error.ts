"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ApiError, apiErrorMessage } from "@/lib/api-client";
import { useAuth } from "../auth/auth-provider";
import { useToast } from "./toast";

export function useApiErrorHandler() {
  const { logout } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  return useCallback(
    async (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        showToast("登录已失效，请重新登录。", "danger");
        router.replace("/login");
        return;
      }
      showToast(apiErrorMessage(error), "danger");
    },
    [logout, router, showToast],
  );
}
