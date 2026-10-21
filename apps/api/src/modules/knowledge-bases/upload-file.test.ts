import { describe, expect, it } from "vitest";
import {
  resolveMaxUploadBytes,
  sanitizeFileName,
  validateUploadFile,
  validateUploadSize,
} from "./upload-file";

const maxBytes = 20 * 1024 * 1024;

describe("upload file validation", () => {
  it("strips path separators and traversal segments", () => {
    expect(sanitizeFileName("../../evil.pdf")).toBe("evil.pdf");
    expect(sanitizeFileName("..\\..\\evil.pdf")).toBe("evil.pdf");
    expect(sanitizeFileName("C:\\fakepath\\report.docx")).toBe("report.docx");
    expect(sanitizeFileName("notes..md")).toBeNull();
    expect(sanitizeFileName("  ")).toBeNull();
    expect(sanitizeFileName("..")).toBeNull();
    expect(sanitizeFileName("CON.txt")).toBeNull();
    expect(sanitizeFileName("bad:name.txt")).toBeNull();
    expect(sanitizeFileName("trailing.")).toBeNull();
  });

  it("accepts allowed extensions and MIME types", () => {
    expect(validateUploadFile("policy.pdf", "application/pdf", 1024, maxBytes).safeFileName).toBe(
      "policy.pdf",
    );
    expect(validateUploadFile("notes.md", "text/markdown", 1024, maxBytes).mimeType).toBe(
      "text/markdown",
    );
    expect(
      validateUploadFile(
        "contract.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        1024,
        maxBytes,
      ).extension,
    ).toBe(".docx");
    expect(
      validateUploadFile("readme.txt", "text/plain; charset=utf-8", 1024, maxBytes).mimeType,
    ).toBe("text/plain");
  });

  it("rejects unsupported extensions, MIME mismatches and empty names", () => {
    expect(() => validateUploadFile("malware.exe", "application/pdf", 10, maxBytes)).toThrow(
      "只支持",
    );
    expect(() => validateUploadFile("policy.pdf", "text/plain", 10, maxBytes)).toThrow("MIME");
    expect(() => validateUploadFile("", "application/pdf", 10, maxBytes)).toThrow("文件名");
    expect(() => validateUploadFile("../..", "application/pdf", 10, maxBytes)).toThrow("文件名");
  });

  it("rejects empty and oversized payloads", () => {
    expect(() => validateUploadSize(0, maxBytes)).toThrow("文件为空");
    expect(() => validateUploadSize(maxBytes + 1, maxBytes)).toThrow("不能超过");
    expect(() => validateUploadSize(10, 10)).not.toThrow();
  });

  it("falls back to the default upload limit", () => {
    expect(resolveMaxUploadBytes(undefined)).toBe(maxBytes);
    expect(resolveMaxUploadBytes("abc")).toBe(maxBytes);
    expect(resolveMaxUploadBytes("1024")).toBe(1024);
  });
});
