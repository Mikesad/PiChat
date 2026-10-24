"use client";

import { maxPageSize, minPageSize, type PaginationMeta } from "@pichat/shared";
import { Icon } from "../icons";
import { Button } from "./ui";

const pageSizeOptions = [...new Set([minPageSize, 20, 50, maxPageSize])].sort(
  (left, right) => left - right,
);

export function Pagination({
  pagination,
  onPageChange,
  onPageSizeChange,
  disabled = false,
}: {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  disabled?: boolean;
}) {
  const totalPages = pagination.totalPages;
  const currentPage = totalPages === 0 ? 1 : Math.min(pagination.page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2.5">
      <p className="text-xs text-subtle">
        共 {pagination.total} 条 · 第 {currentPage} / {Math.max(totalPages, 1)} 页
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-subtle">
          每页
          <select
            value={pagination.pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            disabled={disabled}
            className="h-8 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs text-fg focus:border-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} 条
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={disabled || currentPage <= 1}
        >
          <Icon name="arrow-left" size={13} />
          上一页
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={disabled || totalPages === 0 || currentPage >= totalPages}
        >
          下一页
          <Icon name="arrow-left" size={13} className="rotate-180" />
        </Button>
      </div>
    </div>
  );
}
