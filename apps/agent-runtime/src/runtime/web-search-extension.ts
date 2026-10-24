import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { RuntimeConfig } from "../config.js";
import { prepareWebSearchConfig } from "./web-search-config.js";

let loaded: Promise<ExtensionFactory> | undefined;

export async function loadWebSearchExtension(config: RuntimeConfig): Promise<ExtensionFactory> {
  await prepareWebSearchConfig(config);
  loaded ??= import("pi-web-access/dist/index.js")
    .then((module) => wrapExtension(module.default))
    .catch((error: unknown) => {
      loaded = undefined;
      throw error;
    });
  return loaded;
}

function wrapExtension(factory: ExtensionFactory): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    const wrapped = new Proxy(pi, {
      get(target, property, receiver) {
        if (property === "registerTool") {
          return (tool: Parameters<ExtensionAPI["registerTool"]>[0]) => {
            target.registerTool(
              tool.name === "web_search" ? { ...tool, executionMode: "sequential" } : tool,
            );
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    return factory(wrapped);
  };
}
