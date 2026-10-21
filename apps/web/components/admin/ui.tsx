"use client";

import Link from "next/link";
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useId, useRef } from "react";
import {
  type AclPermission,
  type AclSubject,
  type DocumentStatus,
  statusMeta,
  subjectName,
} from "@/lib/admin-data";
import { cn } from "@/lib/utils";
import { Icon, type IconName, Spinner } from "../icons";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const buttonBase =
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "border border-border bg-surface text-fg hover:bg-surface-2",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger text-white hover:opacity-90 dark:text-slate-950",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-2.5 text-xs",
  md: "h-10 px-3.5 text-sm sm:h-9",
};

export function buttonStyles(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return <button type={type} className={buttonStyles(variant, size, className)} {...props} />;
}

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonStyles(variant, size, className)}>
      {children}
    </Link>
  );
}

type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "outline";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent-text",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  outline: "border border-border text-muted",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const statusIcons: Record<DocumentStatus, IconName> = {
  pending: "clock",
  parsing: "clock",
  ready: "check-circle",
  failed: "alert-circle",
  deleted: "ban",
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const meta = statusMeta[status];
  return (
    <Badge tone={meta.tone}>
      {status === "parsing" ? (
        <Spinner className="size-3" />
      ) : (
        <Icon name={statusIcons[status]} size={11} />
      )}
      {meta.label}
    </Badge>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  backHref,
  backLabel = "返回",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {backHref ? (
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-fg"
          >
            <Icon name="arrow-left" size={14} />
            {backLabel}
          </Link>
        ) : null}
        {eyebrow ? (
          <p className="text-[11px] font-semibold tracking-wider text-accent-text uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatStrip({
  items,
}: {
  items: Array<{
    label: string;
    value: string | number;
    hint?: string;
    tone?: "default" | "warning" | "danger";
  }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="bg-surface px-4 py-3.5">
          <p className="text-[11px] font-medium tracking-wide text-subtle">{item.label}</p>
          <p
            className={cn(
              "mt-1 text-xl font-semibold tabular-nums",
              item.tone === "danger"
                ? "text-danger"
                : item.tone === "warning"
                  ? "text-warning"
                  : "text-fg",
            )}
          >
            {item.value}
          </p>
          {item.hint ? <p className="mt-0.5 text-[11px] text-subtle">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("relative w-full sm:max-w-xs", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Icon
        name="search"
        size={15}
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-border bg-surface pr-3 pl-8 text-sm text-fg transition-colors placeholder:text-subtle focus:border-accent sm:h-9"
      />
    </div>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 cursor-pointer items-center rounded-full border px-3 text-xs font-medium transition-colors duration-150",
        active
          ? "border-accent bg-accent-soft text-accent-text"
          : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  icon = "folder",
  title,
  description,
  action,
  className,
}: {
  icon?: IconName;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <span className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-subtle">
        <Icon name={icon} size={20} />
      </span>
      <p className="mt-3 text-sm font-medium text-fg">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-subtle">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function InfoBanner({
  tone = "neutral",
  icon = "info",
  title,
  children,
  action,
}: {
  tone?: "neutral" | "accent" | "warning" | "danger";
  icon?: IconName;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    neutral: "border-border bg-surface-2/60 text-muted",
    accent: "border-accent-soft-border bg-accent-soft text-muted",
    warning: "border-warning/30 bg-warning-soft text-muted",
    danger: "border-danger/30 bg-danger-soft text-muted",
  };
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border p-3.5", tones[tone])}>
      <Icon
        name={icon}
        size={15}
        className={cn(
          "mt-0.5 shrink-0",
          tone === "warning"
            ? "text-warning"
            : tone === "danger"
              ? "text-danger"
              : tone === "accent"
                ? "text-accent-text"
                : "text-subtle",
        )}
      />
      <div className="min-w-0 flex-1 text-xs leading-5">
        {title ? <p className="font-medium text-fg">{title}</p> : null}
        <div className={title ? "mt-0.5" : undefined}>{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export const thClass =
  "whitespace-nowrap border-b border-border bg-surface-2/60 px-3 py-2.5 text-left text-[11px] font-medium tracking-wide text-subtle";
export const tdClass = "border-b border-border px-3 py-3 align-middle";
export const trClass = "transition-colors duration-150 hover:bg-surface-2/60";

export function TableShell({
  children,
  footer,
  minWidth = 720,
}: {
  children: ReactNode;
  footer?: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          {children}
        </table>
      </div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs text-subtle">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      aria-label={label}
      className="size-4 cursor-pointer rounded border-border accent-accent"
    />
  );
}

export function FormField({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-fg">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs leading-5 text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg transition-colors placeholder:text-subtle focus:border-accent sm:h-9";
export const textareaClass =
  "min-h-24 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-6 text-fg transition-colors placeholder:text-subtle focus:border-accent";
export const selectClass =
  "h-10 w-full cursor-pointer rounded-lg border border-border bg-surface px-2.5 text-sm text-fg transition-colors focus:border-accent sm:h-9";

export function SubjectChip({
  subject,
  permission,
}: {
  subject: AclSubject;
  permission?: AclPermission;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
        permission === "deny"
          ? "border-danger/30 bg-danger-soft text-danger"
          : "border-border bg-surface text-muted",
      )}
    >
      <Icon name={subject.type === "group" ? "users" : "user"} size={11} className="shrink-0" />
      <span className="truncate">{subjectName(subject)}</span>
      {permission ? (
        <span className="shrink-0 text-[10px] opacity-80">
          {permission === "deny" ? "拒绝" : "读取"}
        </span>
      ) : null}
    </span>
  );
}
