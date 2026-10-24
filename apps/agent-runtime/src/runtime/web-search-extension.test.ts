import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RuntimeConfig } from "../config.js";
import { loadWebSearchExtension } from "./web-search-extension.js";

describe("web search extension", () => {
  let dataDir: string;
  let config: RuntimeConfig;

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "pichat-web-search-"));
    config = {
      port: 3002,
      internalSecret: "test",
      apiInternalUrl: "http://127.0.0.1:3001",
      dataDir,
      runTimeoutMs: 10_000,
      ragflow: { baseUrl: "http://ragflow", apiKey: "key", timeoutMs: 1000 },
      search: {
        topK: 6,
        maxTopK: 12,
        similarityThreshold: 0.2,
        answerSimilarityThreshold: 0.35,
        highSimilarityThreshold: 0.6,
        vectorWeight: 0.3,
        maxSnippetChars: 1200,
        maxResultChars: 12_000,
      },
      model: { contextWindow: 128_000, maxTokens: 8192 },
      webSearch: { provider: "bocha", apiKey: "", maxResults: 5 },
    };
  });

  afterAll(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("registers only web_search and writes a locked-down config", async () => {
    const extension = await loadWebSearchExtension(config);
    const tools: Array<{ name: string; executionMode?: string }> = [];
    const commands: string[] = [];
    const pi = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "registerTool") {
            return (tool: { name: string; executionMode?: string }) => tools.push(tool);
          }
          if (property === "registerCommand") {
            return (name: string) => commands.push(name);
          }
          return () => {};
        },
      },
    );

    await extension(pi as never);

    expect(tools.map((tool) => tool.name)).toEqual(["web_search"]);
    expect(tools[0]?.executionMode).toBe("sequential");
    expect(commands).toEqual([]);

    const raw = await readFile(join(dataDir, "pi-agent", "web-search.json"), "utf-8");
    const written = JSON.parse(raw) as {
      provider?: string;
      workflow?: string;
      toolActivation?: string;
      tavilyApiKey?: string;
      bochaApiKey?: string;
      webSearch?: { allowedProviders?: string[] };
      tools?: Record<string, { enabled?: boolean }>;
    };
    expect(written.provider).toBe("bocha");
    expect(written.workflow).toBe("none");
    expect(written.toolActivation).toBe("eager");
    expect(written.webSearch?.allowedProviders).toEqual(["tavily", "bocha"]);
    expect(written.tavilyApiKey).toBe("$PICHAT_WEB_SEARCH_TAVILY_KEY");
    expect(written.bochaApiKey).toBe("$PICHAT_WEB_SEARCH_BOCHA_KEY");
    expect(raw).not.toContain("test-key");
    expect(written.tools).toEqual({
      webSearch: { enabled: true },
      sourceCheck: { enabled: false },
      fetchContent: { enabled: false },
      getSearchContent: { enabled: false },
    });
  }, 20_000);
});
