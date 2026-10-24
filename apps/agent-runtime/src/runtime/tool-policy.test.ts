import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  createToolPolicyExtension,
  sanitizeWebSearchInput,
  type ToolPolicyOptions,
} from "./tool-policy.js";

type ToolCallHandler = (event: {
  toolName: string;
  input: Record<string, unknown>;
}) => Promise<{ block?: boolean; reason?: string } | undefined>;

function getToolCallHandler(
  allowWebSearch: boolean,
  options: Omit<ToolPolicyOptions, "allowWebSearch" | "webSearchMaxResults"> = {},
): ToolCallHandler {
  let handler: ToolCallHandler | undefined;
  const pi = {
    on(event: string, callback: ToolCallHandler) {
      if (event === "tool_call") {
        handler = callback;
      }
    },
  } as unknown as ExtensionAPI;
  createToolPolicyExtension({ allowWebSearch, webSearchMaxResults: 5, ...options })(pi);
  if (!handler) {
    throw new Error("tool_call handler was not registered");
  }
  return handler;
}

describe("tool policy", () => {
  it("blocks web search when the toggle is off", async () => {
    const handler = getToolCallHandler(false);
    await expect(
      handler({ toolName: "web_search", input: { queries: ["test"] } }),
    ).resolves.toEqual({ block: true, reason: "tool_not_allowed" });
  });

  it("allows web search and removes unsafe overrides", async () => {
    const handler = getToolCallHandler(true);
    const input: Record<string, unknown> = {
      provider: "exa",
      proxy: "http://127.0.0.1:7890",
      category: "news",
      includeContent: true,
      workflow: "auto-summary",
      numResults: 50,
      queries: ["  first  ", "second", "third", "fourth", "fifth"],
    };
    await expect(handler({ toolName: "web_search", input })).resolves.toBeUndefined();
    expect(input).toEqual({
      workflow: "none",
      numResults: 5,
      queries: ["first", "second", "third", "fourth"],
    });
  });

  it("injects the configured provider and proxy after acquiring the credential gate", async () => {
    let acquired = 0;
    let released = 0;
    const provider = "tavily" as const;
    const handler = getToolCallHandler(true, {
      webSearchProvider: provider,
      webSearchProxy: "http://127.0.0.1:7890",
      webSearchGate: {
        provider,
        proxy: "http://127.0.0.1:7890",
        async acquire() {
          acquired += 1;
        },
        release() {
          released += 1;
        },
      },
    });
    const input: Record<string, unknown> = {
      provider: "exa",
      proxy: "http://evil.example:8080",
      query: "test",
    };
    await expect(handler({ toolName: "web_search", input })).resolves.toBeUndefined();

    expect(acquired).toBe(1);
    expect(released).toBe(0);
    expect(input).toMatchObject({
      provider: "tavily",
      proxy: "http://127.0.0.1:7890",
      query: "test",
    });
  });

  it("clamps malformed search counts and keeps a valid query", () => {
    const input: Record<string, unknown> = {
      numResults: Number.NaN,
      query: `  ${"x".repeat(400)}  `,
    };
    sanitizeWebSearchInput(input, 4);
    expect(input.numResults).toBe(4);
    expect(typeof input.query).toBe("string");
    expect((input.query as string).length).toBe(300);
  });
});
