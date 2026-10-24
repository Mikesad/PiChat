import type {
  AccessCheckResponse,
  ApiErrorBody,
  ApiErrorCode,
  AuditLogListResponse,
  BatchUpdateDocumentAclRequest,
  BatchUpdateDocumentAclResponse,
  ChatMessagesResponse,
  ChatSessionListResponse,
  ChatSessionResponse,
  CreateChatSessionRequest,
  CreateKnowledgeBaseRequest,
  CreateKnowledgeBaseResponse,
  CreateModelConfigRequest,
  CreateSearchConfigRequest,
  DirectoryResponse,
  DocumentListResponse,
  KnowledgeBaseListResponse,
  MemberListResponse,
  MemberResponse,
  ModelConfigListResponse,
  ModelConfigResponse,
  ReparseDocumentResponse,
  SearchConfigListResponse,
  SearchConfigResponse,
  SendChatMessageRequest,
  SessionResponse,
  TestSearchConfigRequest,
  TestSearchConfigResponse,
  UpdateDocumentAclModeRequest,
  UpdateDocumentAclModeResponse,
  UpdateDocumentAclRequest,
  UpdateDocumentAclResponse,
  UpdateKnowledgeBaseAclRequest,
  UpdateKnowledgeBaseAclResponse,
  UpdateKnowledgeBaseRequest,
  UpdateKnowledgeBaseResponse,
  UpdateMemberRequest,
  UpdateModelConfigRequest,
  UpdateSearchConfigRequest,
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

function queryString(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") {
      continue;
    }
    search.set(key, String(value));
  }
  return search.size > 0 ? `?${search.toString()}` : "";
}

export function fetchKnowledgeBases(
  options: { includeLocked?: boolean; page?: number; pageSize?: number } = {},
) {
  const search = queryString({
    includeLocked: options.includeLocked ? "true" : undefined,
    page: options.page,
    pageSize: options.pageSize,
  });
  return apiRequest<KnowledgeBaseListResponse>(`/api/knowledge-bases${search}`);
}

export function createKnowledgeBase(input: CreateKnowledgeBaseRequest) {
  return apiRequest<CreateKnowledgeBaseResponse>("/api/knowledge-bases", {
    method: "POST",
    body: jsonBody(input),
  });
}

export function updateKnowledgeBase(knowledgeBaseId: string, input: UpdateKnowledgeBaseRequest) {
  return apiRequest<UpdateKnowledgeBaseResponse>(
    `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}`,
    { method: "PATCH", body: jsonBody(input) },
  );
}

export function deleteKnowledgeBase(knowledgeBaseId: string) {
  return apiRequest<void>(`/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}`, {
    method: "DELETE",
  });
}

export function fetchDocuments(
  knowledgeBaseId: string,
  options: { includeLocked?: boolean; page?: number; pageSize?: number } = {},
) {
  const search = queryString({
    includeLocked: options.includeLocked ? "true" : undefined,
    page: options.page,
    pageSize: options.pageSize,
  });
  return apiRequest<DocumentListResponse>(
    `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents${search}`,
  );
}

export function updateDocumentsAcl(knowledgeBaseId: string, input: BatchUpdateDocumentAclRequest) {
  return apiRequest<BatchUpdateDocumentAclResponse>(
    `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/documents/acl`,
    { method: "PUT", body: jsonBody(input) },
  );
}

export function deleteDocument(documentId: string) {
  return apiRequest<void>(`/api/documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
  });
}

export function updateDocumentAcl(documentId: string, input: UpdateDocumentAclRequest) {
  return apiRequest<UpdateDocumentAclResponse>(
    `/api/documents/${encodeURIComponent(documentId)}/acl`,
    { method: "PUT", body: jsonBody(input) },
  );
}

export function updateDocumentAclMode(documentId: string, input: UpdateDocumentAclModeRequest) {
  return apiRequest<UpdateDocumentAclModeResponse>(
    `/api/documents/${encodeURIComponent(documentId)}/acl-mode`,
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

export function fetchMembers(options: { page?: number; pageSize?: number } = {}) {
  const search = queryString({ page: options.page, pageSize: options.pageSize });
  return apiRequest<MemberListResponse>(`/api/members${search}`);
}

export function fetchDirectory() {
  return apiRequest<DirectoryResponse>("/api/members/directory");
}

export function updateMember(memberId: string, input: UpdateMemberRequest) {
  return apiRequest<MemberResponse>(`/api/members/${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    body: jsonBody(input),
  });
}

export function resetMemberPassword(memberId: string, password: string) {
  return apiRequest<void>(`/api/members/${encodeURIComponent(memberId)}/password`, {
    method: "POST",
    body: jsonBody({ password }),
  });
}

export function fetchAuditLogs(
  params: {
    page?: number;
    pageSize?: number;
    action?: string;
    resourceType?: string;
    result?: string;
    actorId?: string;
  } = {},
) {
  const suffix = queryString(params);
  return apiRequest<AuditLogListResponse>(`/api/audit-logs${suffix}`);
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

export function fetchSearchConfigs() {
  return apiRequest<SearchConfigListResponse>("/api/search-configs");
}

export function createSearchConfig(input: CreateSearchConfigRequest) {
  return apiRequest<SearchConfigResponse>("/api/search-configs", {
    method: "POST",
    body: jsonBody(input),
  });
}

export function updateSearchConfig(id: string, input: UpdateSearchConfigRequest) {
  return apiRequest<SearchConfigResponse>(`/api/search-configs/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: jsonBody(input),
  });
}

export function deleteSearchConfig(id: string) {
  return apiRequest<void>(`/api/search-configs/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function setDefaultSearchConfig(id: string) {
  return apiRequest<SearchConfigResponse>(`/api/search-configs/${encodeURIComponent(id)}/default`, {
    method: "POST",
  });
}

export function testSearchConfig(input: TestSearchConfigRequest) {
  return apiRequest<TestSearchConfigResponse>("/api/search-configs/test", {
    method: "POST",
    body: jsonBody(input),
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

export function fetchChatSessions() {
  return apiRequest<ChatSessionListResponse>("/api/chat/sessions");
}

export function createChatSession(input: CreateChatSessionRequest = {}) {
  return apiRequest<ChatSessionResponse>("/api/chat/sessions", {
    method: "POST",
    body: jsonBody(input),
  });
}

export function fetchChatMessages(sessionId: string) {
  return apiRequest<ChatMessagesResponse>(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
  );
}

export async function streamChatMessage(
  sessionId: string,
  input: SendChatMessageRequest,
  signal: AbortSignal,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      body: jsonBody(input),
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
  } catch {
    throw new ApiError("无法连接服务，请确认 API 已启动后重试。", 0);
  }

  if (response.ok) {
    return response;
  }

  const text = await response.text();
  const body = parseBody(text);
  if (isApiErrorBody(body)) {
    throw new ApiError(body.message, response.status, body.code);
  }
  throw new ApiError(text || `请求失败（${response.status}）`, response.status);
}

export function abortChatRun(runId: string) {
  return apiRequest<void>(`/api/chat/runs/${encodeURIComponent(runId)}/abort`, {
    method: "POST",
  });
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
