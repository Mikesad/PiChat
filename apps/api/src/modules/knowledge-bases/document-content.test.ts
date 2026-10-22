import { describe, expect, it } from "vitest";
import { contentDisposition, parseRangeHeader } from "./document-content";

describe("document content range", () => {
  it("returns null without a Range header", () => {
    expect(parseRangeHeader(undefined, 10)).toBeNull();
  });

  it("parses open, closed, and suffix ranges", () => {
    expect(parseRangeHeader("bytes=0-3", 10)).toEqual({ start: 0, end: 3 });
    expect(parseRangeHeader("bytes=4-", 10)).toEqual({ start: 4, end: 9 });
    expect(parseRangeHeader("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseRangeHeader("bytes=5-100", 10)).toEqual({ start: 5, end: 9 });
  });

  it("rejects invalid or unsatisfiable ranges", () => {
    expect(parseRangeHeader("bytes=0-1,3-4", 10)).toBe("invalid");
    expect(parseRangeHeader("items=0-1", 10)).toBe("invalid");
    expect(parseRangeHeader("bytes=10-", 10)).toBe("invalid");
    expect(parseRangeHeader("bytes=5-4", 10)).toBe("invalid");
    expect(parseRangeHeader("bytes=-0", 10)).toBe("invalid");
    expect(parseRangeHeader("bytes=0-", 0)).toBe("invalid");
  });
});

describe("content disposition", () => {
  it("keeps an ASCII fallback and encodes UTF-8 file names", () => {
    expect(contentDisposition("报告 2026.pdf")).toBe(
      "inline; filename=\"__ 2026.pdf\"; filename*=UTF-8''%E6%8A%A5%E5%91%8A%202026.pdf",
    );
  });
});
