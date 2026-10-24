"use client";

import { type KeyboardEvent, useRef } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "../icons";

interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  icon?: IconName;
  statusLabel?: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = items.length - 1;
    let nextIndex = index;
    if (event.key === "ArrowRight") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (event.key === "ArrowLeft") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    } else {
      return;
    }
    event.preventDefault();
    const next = items[nextIndex];
    if (next) {
      onChange(next.id);
      refs.current[next.id]?.focus();
    }
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-border">
      {items.map((item, index) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[item.id] = node;
            }}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={active}
            aria-controls={`panel-${item.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "-mb-px inline-flex h-10 cursor-pointer items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition-colors duration-150",
              active
                ? "border-accent text-fg"
                : "border-transparent text-muted hover:border-border-strong hover:text-fg",
            )}
          >
            {item.icon ? <Icon name={item.icon} size={14} className="shrink-0" /> : null}
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                  active ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-subtle",
                )}
              >
                {item.count}
              </span>
            ) : null}
            {item.statusLabel ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-subtle">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-subtle" />
                {item.statusLabel}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
