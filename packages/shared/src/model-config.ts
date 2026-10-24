export type ModelKind = "chat" | "embedding" | "rerank" | "vision" | "speech";

export type ModelProviderId = "opencode-go" | "deepseek" | "siliconflow";

export interface ModelDefinition {
  id: string;
  label: string;
}

export interface ModelProviderDefinition {
  id: ModelProviderId;
  label: string;
  shortLabel: string;
  description: string;
  defaultBaseUrl: string;
  supportedKinds: ModelKind[];
  models: ModelDefinition[];
  modelsByKind?: Partial<Record<ModelKind, ModelDefinition[]>>;
}

export const modelKinds: ModelKind[] = ["chat", "embedding", "rerank", "vision", "speech"];

export const modelProviders: Record<ModelProviderId, ModelProviderDefinition> = {
  "opencode-go": {
    id: "opencode-go",
    label: "OpenCode Go 套餐",
    shortLabel: "OpenCode Go",
    description: "OpenCode Go 订阅模型，OpenAI 兼容端点。",
    defaultBaseUrl: "https://opencode.ai/zen/go/v1",
    supportedKinds: ["chat"],
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
    supportedKinds: ["chat"],
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
    ],
  },
  siliconflow: {
    id: "siliconflow",
    label: "硅基流动 SiliconFlow",
    shortLabel: "SiliconFlow",
    description: "硅基流动托管模型，当前用于 Embedding 与 ReRank。",
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    supportedKinds: ["embedding", "rerank"],
    models: [],
    modelsByKind: {
      embedding: [
        { id: "BAAI/bge-m3@SILICONFLOW", label: "BGE-M3" },
        { id: "BAAI/bge-large-zh-v1.5@SILICONFLOW", label: "BGE Large 中文 v1.5" },
        { id: "BAAI/bge-large-en-v1.5@SILICONFLOW", label: "BGE Large 英文 v1.5" },
        { id: "netease-youdao/bce-embedding-base_v1@SILICONFLOW", label: "BCE Embedding Base v1" },
      ],
      rerank: [
        { id: "BAAI/bge-reranker-v2-m3@SILICONFLOW", label: "BGE Reranker v2 M3" },
        { id: "BAAI/bge-reranker-large@SILICONFLOW", label: "BGE Reranker Large" },
        { id: "Pro/BAAI/bge-reranker-v2-m3@SILICONFLOW", label: "Pro BGE Reranker v2 M3" },
      ],
    },
  },
};

export const providerOptions = [modelProviders["opencode-go"], modelProviders.deepseek];

export const modelProviderIds = Object.keys(modelProviders) as ModelProviderId[];

export function providerOptionsForKind(kind: ModelKind): ModelProviderDefinition[] {
  return modelProviderIds
    .map((id) => modelProviders[id])
    .filter((provider) => provider.supportedKinds.includes(kind));
}

export function modelsForKind(provider: ModelProviderId, kind: ModelKind): ModelDefinition[] {
  return (
    modelProviders[provider].modelsByKind?.[kind] ??
    (kind === "chat" ? modelProviders[provider].models : [])
  );
}

export function isModelProvider(value: unknown): value is ModelProviderId {
  return typeof value === "string" && value in modelProviders;
}

export function isModelKind(value: unknown): value is ModelKind {
  return typeof value === "string" && modelKinds.includes(value as ModelKind);
}

export function defaultDisplayName(provider: ModelProviderId, modelId: string): string {
  return modelId.trim() || modelProviders[provider].shortLabel;
}
