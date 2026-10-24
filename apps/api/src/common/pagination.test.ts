import { describe, expect, it } from "vitest";
import { buildPaginationMeta, pageOffset, paginationSchema } from "./pagination";

describe("pagination", () => {
  it("defaults to page 1 with 10 items per page", () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 10 });
  });

  it("accepts page sizes between 10 and 100", () => {
    expect(paginationSchema.parse({ page: "2", pageSize: "100" })).toEqual({
      page: 2,
      pageSize: 100,
    });
    expect(paginationSchema.safeParse({ pageSize: "9" }).success).toBe(false);
    expect(paginationSchema.safeParse({ pageSize: "101" }).success).toBe(false);
    expect(paginationSchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("builds pagination metadata and offsets", () => {
    expect(buildPaginationMeta({ page: 2, pageSize: 10 }, 25)).toEqual({
      page: 2,
      pageSize: 10,
      total: 25,
      totalPages: 3,
      hasNext: true,
      hasPrevious: true,
    });
    expect(buildPaginationMeta({ page: 1, pageSize: 10 }, 0)).toMatchObject({
      totalPages: 0,
      hasNext: false,
      hasPrevious: false,
    });
    expect(pageOffset({ page: 3, pageSize: 10 })).toBe(20);
  });
});
