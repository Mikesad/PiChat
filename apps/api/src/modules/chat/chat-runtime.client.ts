import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ChatRunRequest } from "@pichat/shared";
import { serviceUnavailable } from "../../common/api-error";

@Injectable()
export class ChatRuntimeClient {
  private readonly baseUrl: string;
  private readonly secret: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.baseUrl = (config.get<string>("AGENT_RUNTIME_URL") ?? "http://127.0.0.1:3002").replace(
      /\/+$/,
      "",
    );
    this.secret = config.get<string>("INTERNAL_SHARED_SECRET")?.trim() ?? "";
  }

  async startRun(input: ChatRunRequest, signal: AbortSignal): Promise<Response> {
    if (!this.secret) {
      throw serviceUnavailable("内部服务未配置");
    }

    try {
      return await fetch(`${this.baseUrl}/internal/chat/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.secret}`,
        },
        body: JSON.stringify(input),
        signal,
      });
    } catch {
      throw serviceUnavailable("Agent Runtime 暂时不可用，请确认服务已启动");
    }
  }

  async abortRun(runId: string): Promise<void> {
    if (!this.secret) {
      return;
    }
    try {
      await fetch(`${this.baseUrl}/internal/chat/runs/${encodeURIComponent(runId)}/abort`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.secret}` },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      // The run will also abort when the upstream connection closes.
    }
  }
}
