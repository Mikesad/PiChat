export type WebSearchProviderName = "tavily" | "bocha";

export const TAVILY_API_KEY_ENV = "PICHAT_WEB_SEARCH_TAVILY_KEY";
export const BOCHA_API_KEY_ENV = "PICHAT_WEB_SEARCH_BOCHA_KEY";

export interface WebSearchSettings {
  provider: WebSearchProviderName;
  apiKey: string;
  proxy?: string;
}

export interface WebSearchCredentialGate {
  readonly provider: WebSearchProviderName;
  readonly proxy: string;
  acquire(): Promise<void>;
  release(): void;
}

let queue: Promise<void> = Promise.resolve();

export function createWebSearchCredentialGate(
  settings: WebSearchSettings,
): WebSearchCredentialGate {
  let held = false;
  let finish: (() => void) | null = null;

  return {
    provider: settings.provider,
    proxy: settings.proxy?.trim() ?? "",
    async acquire() {
      if (held) {
        return;
      }
      let releaseQueue: () => void = () => {};
      const current = new Promise<void>((resolve) => {
        releaseQueue = resolve;
      });
      const previous = queue;
      queue = previous.then(() => current);
      await previous;
      held = true;
      finish = releaseQueue;

      const envName = settings.provider === "tavily" ? TAVILY_API_KEY_ENV : BOCHA_API_KEY_ENV;
      if (settings.apiKey) {
        process.env[envName] = settings.apiKey;
      } else {
        delete process.env[envName];
      }
    },
    release() {
      if (!held) {
        return;
      }
      const envName = settings.provider === "tavily" ? TAVILY_API_KEY_ENV : BOCHA_API_KEY_ENV;
      delete process.env[envName];
      held = false;
      finish?.();
      finish = null;
    },
  };
}
