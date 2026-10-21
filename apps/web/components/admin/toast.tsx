"use client";

import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "../icons";

type ToastTone = "success" | "danger" | "neutral";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, string> = {
  success: "text-success",
  danger: "text-danger",
  neutral: "text-muted",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = "success") => {
      idRef.current += 1;
      const id = idRef.current;
      setToasts((previous) => [...previous, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, clearToasts }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 top-16 z-30 flex flex-col items-center gap-2 px-4 sm:top-auto sm:right-6 sm:bottom-36 sm:left-auto sm:items-end sm:px-0"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3 shadow-pop"
          >
            <Icon
              name={toast.tone === "danger" ? "alert-circle" : "check-circle"}
              size={16}
              className={cn("mt-0.5 shrink-0", toneStyles[toast.tone])}
            />
            <p className="min-w-0 flex-1 text-sm leading-5 text-fg">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="关闭提示"
              className="-m-1 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return value;
}
