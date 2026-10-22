import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const allowedTools = new Set(["kb_search", "kb_read"]);

const secretPatterns = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /(?:api[_-]?key|access[_-]?token|secret)\s*[:=]\s*[^\s,;]+/gi,
];

function redactText(text: string): string {
  let next = text;
  for (const pattern of secretPatterns) {
    next = next.replace(pattern, "[redacted]");
  }
  return next;
}

export function toolPolicyExtension(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event) => {
    if (!allowedTools.has(event.toolName)) {
      return { block: true, reason: "tool_not_allowed" };
    }
    return undefined;
  });

  pi.on("tool_result", async (event) => {
    let changed = false;
    const content = event.content.map((block) => {
      if (block.type !== "text") {
        return block;
      }
      const text = redactText(block.text);
      if (text === block.text) {
        return block;
      }
      changed = true;
      return { ...block, text };
    });

    return changed ? { content } : undefined;
  });
}
