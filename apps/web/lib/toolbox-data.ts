export type McpTransport = "sse" | "streamable-http";
export type McpAuthType = "none" | "api-key" | "oauth";

export interface ToolboxHeader {
  id: string;
  name: string;
  value: string;
}

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  sourceType: "url" | "zip";
  source: string;
  enabled: boolean;
  createdAt: string;
}

export interface McpServerEntry {
  id: string;
  name: string;
  transport: McpTransport;
  url: string;
  headers: ToolboxHeader[];
  authType: McpAuthType;
  authHeaderName: string;
  hasCredential: boolean;
  credentialHint: string;
  purpose: string;
  autoInvoke: boolean;
  enabled: boolean;
  createdAt: string;
}

export interface ToolboxState {
  skills: SkillEntry[];
  mcpServers: McpServerEntry[];
}

export interface ImportedMcpConfig {
  name: string;
  url: string;
  transport: McpTransport;
  headers: ToolboxHeader[];
  authorization: string | null;
}

export const toolboxStorageKey = "pichat.toolbox.v1";

export const mcpTransportMeta: Record<McpTransport, { label: string; description: string }> = {
  sse: {
    label: "SSE",
    description: "Server-Sent Events 长连接",
  },
  "streamable-http": {
    label: "HTTP Streamable",
    description: "基于 HTTP 的流式传输",
  },
};

export const mcpAuthMeta: Record<McpAuthType, { label: string; description: string }> = {
  none: {
    label: "无 / 自定义 Header",
    description: "不使用专用认证，可在自定义请求头中补充鉴权信息。",
  },
  "api-key": {
    label: "API Key / Token",
    description: "通过固定的请求头传递 API Key 或 Bearer Token。",
  },
  oauth: {
    label: "OAuth 2.0（首次连接授权）",
    description: "首次连接时在浏览器完成 OAuth 授权。",
  },
};

export function createToolboxId(prefix: string): string {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${random}`;
}

export function createEmptyToolboxState(): ToolboxState {
  return { skills: [], mcpServers: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSkillEntry(value: unknown): value is SkillEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.sourceType === "url" || value.sourceType === "zip") &&
    typeof value.source === "string"
  );
}

function isMcpServerEntry(value: unknown): value is McpServerEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.url === "string"
  );
}

export function loadToolboxState(): ToolboxState {
  if (typeof window === "undefined") {
    return createEmptyToolboxState();
  }
  try {
    const raw = window.localStorage.getItem(toolboxStorageKey);
    if (!raw) {
      return createEmptyToolboxState();
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return createEmptyToolboxState();
    }
    return {
      skills: Array.isArray(parsed.skills) ? parsed.skills.filter(isSkillEntry) : [],
      mcpServers: Array.isArray(parsed.mcpServers)
        ? parsed.mcpServers.filter(isMcpServerEntry)
        : [],
    };
  } catch {
    return createEmptyToolboxState();
  }
}

export function saveToolboxState(state: ToolboxState) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(toolboxStorageKey, JSON.stringify(state));
  } catch {
    return;
  }
}

export function maskCredential(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) {
    return "••••••••";
  }
  return `${trimmed.slice(0, 3)}••••${trimmed.slice(-4)}`;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function deriveSkillName(source: string): string {
  const trimmed = source.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("@")) {
    const slug = trimmed.split("/")[1];
    return slug ?? trimmed;
  }
  const segment = trimmed.split("/").pop() ?? trimmed;
  return segment.replace(/\.git$/i, "").replace(/\.zip$/i, "") || trimmed;
}

export function parseMcpImport(raw: string): ImportedMcpConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("JSON 格式不正确，请检查逗号和引号");
  }
  if (!isRecord(parsed)) {
    throw new Error("配置必须是一个 JSON 对象");
  }

  let name = "mcp-server";
  let config: Record<string, unknown> | null = null;
  const servers = parsed.mcpServers;

  if (isRecord(servers)) {
    const entry = Object.entries(servers)[0];
    if (!entry) {
      throw new Error("mcpServers 为空，没有可导入的服务");
    }
    name = entry[0];
    config = isRecord(entry[1]) ? entry[1] : null;
  } else if (typeof parsed.url === "string" || typeof parsed.serverUrl === "string") {
    name = typeof parsed.name === "string" ? parsed.name : "mcp-server";
    config = parsed;
  }

  if (!config) {
    throw new Error("未找到远程 MCP 服务配置（需要 url）");
  }

  const url =
    typeof config.url === "string"
      ? config.url
      : typeof config.serverUrl === "string"
        ? config.serverUrl
        : "";
  if (!url) {
    throw new Error("配置缺少服务 URL");
  }

  const rawType =
    typeof config.type === "string"
      ? config.type.toLowerCase()
      : typeof config.transport === "string"
        ? config.transport.toLowerCase()
        : "";
  const transport: McpTransport = rawType.includes("sse") ? "sse" : "streamable-http";
  const headers: ToolboxHeader[] = [];
  let authorization: string | null = null;
  const headerSource = config.headers;

  if (isRecord(headerSource)) {
    for (const [key, value] of Object.entries(headerSource)) {
      if (typeof value !== "string") {
        continue;
      }
      if (key.toLowerCase() === "authorization") {
        authorization = value;
        continue;
      }
      headers.push({ id: createToolboxId("header"), name: key, value });
    }
  }

  return { name, url, transport, headers, authorization };
}
