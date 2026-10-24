import { defaultPageSize, maxPageSize, minPageSize, type PaginationMeta } from "@pichat/shared";
import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(minPageSize).max(maxPageSize).default(defaultPageSize),
});

export interface PaginationInput {
  page: number;
  pageSize: number;
}

export function pageOffset(input: PaginationInput): number {
  return (input.page - 1) * input.pageSize;
}

export function buildPaginationMeta(input: PaginationInput, total: number): PaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);
  return {
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages,
    hasNext: input.page < totalPages,
    hasPrevious: input.page > 1,
  };
}

export function clampPage(input: PaginationInput, total: number): PaginationInput {
  const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);
  if (totalPages === 0) {
    return { ...input, page: 1 };
  }
  return { ...input, page: Math.min(input.page, totalPages) };
}
