export interface ByteRange {
  start: number;
  end: number;
}

export function parseRangeHeader(
  header: string | undefined,
  size: number,
): ByteRange | null | "invalid" {
  if (!header) {
    return null;
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    return "invalid";
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) {
    return "invalid";
  }

  const startText = match[1] ?? "";
  const endText = match[2] ?? "";
  if (startText.length === 0 && endText.length === 0) {
    return "invalid";
  }

  if (startText.length === 0) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return "invalid";
    }
    return { start: Math.max(size - suffixLength, 0), end: size - 1 };
  }

  const start = Number(startText);
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) {
    return "invalid";
  }

  const end = endText.length === 0 ? size - 1 : Number(endText);
  if (!Number.isSafeInteger(end) || end < start) {
    return "invalid";
  }

  return { start, end: Math.min(end, size - 1) };
}

export function contentDisposition(fileName: string): string {
  const fallback = fileName
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 180);
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${fallback || "document"}"; filename*=UTF-8''${encoded}`;
}
