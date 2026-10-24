import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeConfig } from "../config.js";
import { BOCHA_API_KEY_ENV, TAVILY_API_KEY_ENV } from "./web-search-credential.js";

let pendingConfig: Promise<void> | undefined;

export function prepareWebSearchConfig(config: RuntimeConfig): Promise<void> {
  const agentDir = join(config.dataDir, "pi-agent");
  const cacheDir = join(config.dataDir, "web-search-cache");

  if (!pendingConfig) {
    process.env.PI_CODING_AGENT_DIR = agentDir;
    process.env.PI_WEB_ACCESS_CACHE_ROOT = cacheDir;
    if (config.webSearch.apiKey) {
      const envName =
        config.webSearch.provider === "tavily" ? TAVILY_API_KEY_ENV : BOCHA_API_KEY_ENV;
      process.env[envName] = config.webSearch.apiKey;
    }
    pendingConfig = writeWebSearchConfig(config, agentDir).catch((error: unknown) => {
      pendingConfig = undefined;
      throw error;
    });
  }
  return pendingConfig;
}

async function writeWebSearchConfig(config: RuntimeConfig, agentDir: string): Promise<void> {
  await mkdir(agentDir, { recursive: true });

  const webSearchConfig = {
    provider: config.webSearch.provider,
    tavilyApiKey: `$${TAVILY_API_KEY_ENV}`,
    bochaApiKey: `$${BOCHA_API_KEY_ENV}`,
    webSearch: {
      enabled: true,
      allowedProviders: ["tavily", "bocha"],
    },
    tools: {
      webSearch: { enabled: true },
      sourceCheck: { enabled: false },
      fetchContent: { enabled: false },
      getSearchContent: { enabled: false },
    },
    toolActivation: "eager",
    toolExposure: "direct",
    workflow: "none",
    autoOpenBrowser: false,
    commands: {
      websearch: { enabled: false },
      curator: { enabled: false },
      search: { enabled: false },
      "google-account": { enabled: false },
    },
    fetch: {
      allowedModes: ["readable"],
    },
    image: { enabled: false },
    githubClone: { enabled: false },
    githubPrIssue: { enabled: false },
    youtube: { enabled: false },
    video: { enabled: false },
    pdf: { enabled: false },
    allowBrowserCookies: false,
  };

  await writeFile(join(agentDir, "web-search.json"), JSON.stringify(webSearchConfig, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}
