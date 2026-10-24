"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Drawer } from "./admin/drawer";
import { Button } from "./admin/ui";
import { Icon } from "./icons";

export interface KnowledgeBaseOption {
  id: string;
  name: string;
  documentCount: number;
}

interface KnowledgeBasePickerProps {
  options: KnowledgeBaseOption[];
  selectedIds: string[];
  onApply: (ids: string[]) => void;
  onClose: () => void;
}

export function KnowledgeBasePicker({
  options,
  selectedIds,
  onApply,
  onClose,
}: KnowledgeBasePickerProps) {
  const [selected, setSelected] = useState(() => new Set(selectedIds));
  const allSelected = options.length > 0 && selected.size === options.length;

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(options.map((option) => option.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="选择知识库"
      description="只列出当前账号可读的知识库。选择只影响本会话后续消息，并在下一次提问时生效。"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-subtle">
            已选 {selected.size} / {options.length} 个知识库
            {selected.size === 0 ? " · 本次不会检索知识库" : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button onClick={() => onApply([...selected])} disabled={options.length === 0}>
              应用
            </Button>
          </div>
        </div>
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-fg">知识库范围</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={allSelected ? clearAll : selectAll}
            disabled={options.length === 0}
            className="inline-flex h-8 cursor-pointer items-center rounded-md px-2 text-[11px] text-accent-text transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allSelected ? "清空" : "全选"}
          </button>
        </div>
      </div>

      {options.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-subtle">
          当前账号没有可读的知识库。
        </p>
      ) : (
        <ul className="space-y-1.5">
          {options.map((option) => {
            const checked = selected.has(option.id);
            return (
              <li key={option.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                    checked
                      ? "border-accent/40 bg-accent-soft"
                      : "border-border bg-surface hover:bg-surface-2",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(option.id)}
                    className="size-4 shrink-0 cursor-pointer"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <Icon name="database" size={14} className="shrink-0 text-subtle" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{option.name}</span>
                    <span className="mt-0.5 block text-[11px] text-subtle">
                      {option.documentCount} 篇可读文档
                    </span>
                  </span>
                  {checked ? (
                    <Icon name="check" size={15} className="shrink-0 text-accent" />
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}
