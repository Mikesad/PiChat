import { extname } from "node:path";
import { invalidRequest } from "../../common/api-error";

export const DEFAULT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const allowedMimeTypes: Record<string, Set<string>> = {
  ".pdf": new Set(["application/pdf"]),
  ".docx": new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  ".md": new Set(["text/markdown", "text/plain", "application/octet-stream"]),
  ".txt": new Set(["text/plain", "application/octet-stream"]),
};

const windowsReservedNames = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

export interface ValidatedUploadFile {
  safeFileName: string;
  extension: string;
  mimeType: string;
}

export function sanitizeFileName(rawFileName: string): string | null {
  const withoutPath = rawFileName.split(/[\\/]/).pop() ?? "";
  const cleaned = Array.from(withoutPath)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  if (
    cleaned.length === 0 ||
    cleaned === "." ||
    cleaned === ".." ||
    cleaned.includes("..") ||
    cleaned.length > 180 ||
    /[<>:"|?*]/.test(cleaned) ||
    /[. ]$/.test(cleaned)
  ) {
    return null;
  }

  const baseName = cleaned.includes(".") ? cleaned.slice(0, cleaned.lastIndexOf(".")) : cleaned;
  if (windowsReservedNames.has(baseName.toLowerCase())) {
    return null;
  }

  return cleaned;
}

export function validateUploadFile(
  rawFileName: string,
  rawMimeType: string,
  sizeBytes: number,
  maxBytes: number,
): ValidatedUploadFile {
  const safeFileName = sanitizeFileName(rawFileName);
  if (!safeFileName) {
    throw invalidRequest("文件名不合法");
  }

  const extension = extname(safeFileName).toLowerCase();
  const mimeTypes = allowedMimeTypes[extension];
  if (!mimeTypes) {
    throw invalidRequest("只支持 PDF、DOCX、MD、TXT 文件");
  }

  const mimeType = rawMimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!mimeTypes.has(mimeType)) {
    throw invalidRequest("文件 MIME 类型不在允许列表内");
  }

  validateUploadSize(sizeBytes, maxBytes);

  return { safeFileName, extension, mimeType };
}

export function validateUploadSize(sizeBytes: number, maxBytes: number): void {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw invalidRequest("文件为空");
  }
  if (sizeBytes > maxBytes) {
    throw invalidRequest(`文件不能超过 ${Math.floor(maxBytes / (1024 * 1024))}MB`);
  }
}

export function resolveMaxUploadBytes(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_UPLOAD_BYTES;
  }
  return Math.floor(parsed);
}
