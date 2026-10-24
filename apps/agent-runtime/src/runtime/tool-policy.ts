import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { WebSearchCredentialGate, WebSearchProviderName } from "./web-search-credential.js";

const baseAllowedTools = new Set([
  "kb_search",
  "kb_read",
  "kb_list_scope",
  "kb_read_around",
  "kb_find_in_document",
  "kb_document_outline",
]);

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

export function sanitizeWebSearchInput(input: Record<string, unknown>, maxResults: number): void {
  delete input.provider;
  delete input.proxy;
  delete input.category;
  delete input.includeContent;
  input.workflow = "none";

  const requested =
    typeof input.numResults === "number" && Number.isFinite(input.numResults)
      ? Math.floor(input.numResults)
      : maxResults;
  input.numResults = Math.min(Math.max(requested, 1), Math.max(maxResults, 1));

  if (Array.isArray(input.queries)) {
    const queries = input.queries
      .filter((query): query is string => typeof query === "string")
      .map((query) => query.trim().slice(0, 300))
      .filter((query) => query.length > 0)
      .slice(0, 4);
    if (queries.length > 0) {
      input.queries = queries;
    } else {
      delete input.queries;
    }
  }
  if (typeof input.query === "string") {
    const query = input.query.trim().slice(0, 300);
    if (query) {
      input.query = query;
    } else {
      delete input.query;
    }
  }
}

export interface ToolPolicyOptions {
  allowWebSearch?: boolean;
  webSearchMaxResults?: number;
  webSearchProvider?: WebSearchProviderName;
  webSearchProxy?: string;
  webSearchGate?: WebSearchCredentialGate;
}

export function createToolPolicyExtension(options: ToolPolicyOptions = {}): ExtensionFactory {
  const allowWebSearch = options.allowWebSearch === true;
  const webSearchMaxResults = Math.max(1, options.webSearchMaxResults ?? 5);
  const webSearchProvider = options.webSearchProvider;
  const webSearchProxy = options.webSearchProxy?.trim() ?? "";
  const webSearchGate = options.webSearchGate;
  const allowedTools = new Set(baseAllowedTools);
  if (allowWebSearch) {
    allowedTools.add("web_search");
  }

  return (pi: ExtensionAPI): void => {
    pi.on("tool_call", async (event) => {
      if (!allowedTools.has(event.toolName)) {
        return { block: true, reason: "tool_not_allowed" };
      }
      if (event.toolName === "web_search") {
        await webSearchGate?.acquire();
        sanitizeWebSearchInput(event.input, webSearchMaxResults);
        if (webSearchProvider) {
          event.input.provider = webSearchProvider;
        }
        if (webSearchProxy) {
          event.input.proxy = webSearchProxy;
        }
      }
      return undefined;
    });

    pi.on("tool_result", async (event) => {
      if (event.toolName === "web_search") {
        webSearchGate?.release();
      }

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
  };
}
