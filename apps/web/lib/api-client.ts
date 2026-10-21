import type {
  AccessCheckResponse,
  ApiErrorBody,
  ApiErrorCode,
  CreateModelConfigRequest,
  DocumentListResponse,
  KnowledgeBaseListResponse,
  ModelConfigListResponse,
  ModelConfigResponse,
  ReparseDocumentResponse,
  SessionResponse,
  UpdateDocumentAclRequest,
  UpdateDocumentAclResponse,
  UpdateKnowledgeBaseAclRequest,
  UpdateKnowledgeBaseAclResponse,
  UpdateModelConfigRequest,
  UploadDocumentResponse,
} from "@pichat/shared";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | null;

  constructor(message: string, status: number, code: ApiErrorCode | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function parseBody(text: string): unknown {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ApiErrorBody).code === "string" &&
    typeof (value as ApiErrorBody).message === "string"
  );
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (typeof init.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("无法连接服务，请确认 API 已启动后重试。", 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const body = parseBody(text);

  if (!response.ok) {
    if (isApiErrorBody(body)) {
      throw new ApiError(body.message, response.status, body.code);
    }
    throw new ApiError(text || `请求失败（${response.status}）`, response.status);
  }

  return body as T;
}

function jsonBody(value: unknown) {
  return JSON.stringify(value);
}

export function fetchSession() {
  return apiRequest<SessionResponse>("/api/auth/me");
}

export function login(email: string, password: string) {
  return apiRequest<SessionResponse>("/api/auth/login", {
    method: "POST",
    body: jsonBody({ email, password }),
  });
}

export function logout() {
  return apiRequest<void>("/api/auth/logout", { method: "POST" });
}

export function fetchKnowledgeBases() {
  return apiRequest<KnowledgeBaseListResponse>("/api/knowledge-bases");
}

export function fetchDocuments(knowledgeBaseId: string) {
  return apiRequest<DocumentListResponse>(
    `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents`,
  );
}

export function updateDocumentAcl(documentId: string, input: UpdateDocumentAclRequest) {
  return apiRequest<UpdateDocumentAclResponse>(
    `/api/documents/${encodeURIComponent(documentId)}/acl`,
    { method: "PUT", body: jsonBody(input) },
  );
}

export function updateKnowledgeBaseAcl(
  knowledgeBaseId: string,
  input: UpdateKnowledgeBaseAclRequest,
) {
  return apiRequest<UpdateKnowledgeBaseAclResponse>(
    `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/acl`,
    { method: "PUT", body: jsonBody(input) },
  );
}

export function checkDocumentAccess(documentId: string) {
  return apiRequest<AccessCheckResponse>("/api/access-check", {
    method: "POST",
    body: jsonBody({ documentId }),
  });
}

export function fetchModelConfigs() {
  return apiRequest<ModelConfigListResponse>("/api/model-configs");
}

export function createModelConfig(input: CreateModelConfigRequest) {
  return apiRequest<ModelConfigResponse>("/api/model-configs", {
    method: "POST",
    body: jsonBody(input),
  });
}

export function updateModelConfig(id: string, input: UpdateModelConfigRequest) {
  return apiRequest<ModelConfigResponse>(`/api/model-configs/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: jsonBody(input),
  });
}

export function deleteModelConfig(id: string) {
  return apiRequest<void>(`/api/model-configs/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function setDefaultModelConfig(id: string) {
  return apiRequest<ModelConfigResponse>(`/api/model-configs/${encodeURIComponent(id)}/default`, {
    method: "POST",
  });
}

export function uploadDocument(knowledgeBaseId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  return apiRequest<UploadDocumentResponse>(
    `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents`,
    { method: "POST", body: formData },
  );
}

export function reparseDocument(documentId: string) {
  return apiRequest<ReparseDocumentResponse>(
    `/api/documents/${encodeURIComponent(documentId)}/reparse`,
    { method: "POST" },
  );
}

export function apiErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return error.message || "没有权限执行此操作。";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}
