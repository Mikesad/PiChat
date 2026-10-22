import type { AccessCheckResult, AccessScopeResponse, InternalPrincipal } from "@pichat/shared";

export class AccessClientError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "AccessClientError";
    this.status = status;
  }
}

export interface AccessClientOptions {
  baseUrl: string;
  secret: string;
  timeoutMs?: number;
}

export class AccessClient {
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly timeoutMs: number;

  constructor(options: AccessClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.secret = options.secret;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async scope(
    principal: InternalPrincipal,
    knowledgeBaseIds?: string[],
    signal?: AbortSignal,
  ): Promise<AccessScopeResponse> {
    return this.post<AccessScopeResponse>(
      "/internal/access/scope",
      { principal, ...(knowledgeBaseIds?.length ? { knowledgeBaseIds } : {}) },
      signal,
    );
  }

  async check(
    principal: InternalPrincipal,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<AccessCheckResult> {
    return this.post<AccessCheckResult>(
      "/internal/access/check",
      { principal, documentId },
      signal,
    );
  }

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.secret}`,
        },
        body: JSON.stringify(body),
        signal: combinedSignal,
      });
    } catch (error) {
      throw new AccessClientError(
        error instanceof Error && error.name === "TimeoutError"
          ? "权限服务响应超时"
          : "无法连接权限服务",
      );
    }

    if (!response.ok) {
      throw new AccessClientError(`权限服务返回 ${response.status}`, response.status);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new AccessClientError("权限服务返回了无效响应");
    }
  }
}
