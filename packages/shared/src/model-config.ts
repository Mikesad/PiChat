export type ModelProviderId = "opencode-go" | "deepseek";

export interface ModelProviderDefinition {
  id: ModelProviderId;
  label: string;
  shortLabel: string;
  description: string;
  defaultBaseUrl: string;
  models: Array<{ id: string; label: string }>;
}

export const modelProviders: Record<ModelProviderId, ModelProviderDefinition> = {
  "opencode-go": {
    id: "opencode-go",
    label: "OpenCode Go 套餐",
    shortLabel: "OpenCode Go",
    description: "OpenCode Go 订阅模型，OpenAI 兼容端点。",
    defaultBaseUrl: "https://opencode.ai/zen/go/v1",
    models: [
      { id: "deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
      { id: "kimi-k3", label: "Kimi K3" },
      { id: "glm-5.3", label: "GLM-5.3" },
      { id: "mimo-v2.5-pro", label: "MiMo V2.5 Pro" },
    ],
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek 官方",
    shortLabel: "DeepSeek",
    description: "DeepSeek 官方 API，适合对话与推理模型。",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
    ],
  },
};

export const providerOptions = [modelProviders["opencode-go"], modelProviders.deepseek];

export const modelProviderIds = providerOptions.map((provider) => provider.id);

export function isModelProvider(value: unknown): value is ModelProviderId {
  return typeof value === "string" && value in modelProviders;
}

export function defaultDisplayName(provider: ModelProviderId, modelId: string): string {
  return modelId.trim() || modelProviders[provider].shortLabel;
}
