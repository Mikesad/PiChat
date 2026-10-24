export type SearchEngineProviderId = "tavily";

export interface SearchEngineProviderDefinition {
  id: SearchEngineProviderId;
  label: string;
  shortLabel: string;
  description: string;
  apiKeyHint: string;
  docsUrl: string;
}

export const searchEngineProviders: Record<SearchEngineProviderId, SearchEngineProviderDefinition> =
  {
    tavily: {
      id: "tavily",
      label: "Tavily Search",
      shortLabel: "Tavily",
      description: "面向 AI 应用的实时搜索 API，返回结构化网页结果。",
      apiKeyHint: "tvly-…",
      docsUrl: "https://app.tavily.com/home",
    },
  };

export const searchEngineProviderOptions = [searchEngineProviders.tavily];

export function isSearchEngineProvider(value: unknown): value is SearchEngineProviderId {
  return typeof value === "string" && value in searchEngineProviders;
}
