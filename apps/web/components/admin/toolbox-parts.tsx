"use client";

import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "../icons";

export function ToolboxSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-fg">
            <span aria-hidden="true" className="h-3.5 w-[3px] shrink-0 rounded-full bg-accent" />
            {title}
          </h3>
          {description ? (
            <p className="mt-1.5 text-[11px] leading-5 text-subtle">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

export function StepIndicator({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="flex items-center gap-3">
      {steps.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        return (
          <Fragment key={label}>
            <li className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-[11px] font-semibold",
                  done
                    ? "bg-accent-soft text-accent-text"
                    : active
                      ? "bg-accent text-accent-fg"
                      : "border border-border bg-surface text-subtle",
                )}
              >
                {done ? <Icon name="check" size={13} /> : step}
              </span>
              <span
                className={cn(
                  "whitespace-nowrap text-xs font-medium",
                  active ? "text-fg" : "text-subtle",
                )}
              >
                {label}
              </span>
            </li>
            {index < steps.length - 1 ? (
              <li aria-hidden="true" className="min-w-6 flex-1">
                <span className="block h-px bg-border" />
              </li>
            ) : null}
          </Fragment>
        );
      })}
    </ol>
  );
}

export function ChoiceButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors duration-150",
        active
          ? "border-accent bg-accent-soft text-accent-text"
          : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {icon ? <Icon name={icon} size={13} className="shrink-0" /> : null}
      {children}
    </button>
  );
}
