import type { ServerResponse } from "node:http";
import { encodeSseEvent, encodeSseHeartbeat, type TypedSseEvent } from "@pichat/shared";

const heartbeatIntervalMs = 15_000;

export class SseWriter {
  private readonly runId: string;
  private readonly raw: ServerResponse;
  private readonly heartbeat: NodeJS.Timeout;
  private sequence = 0;
  private closed = false;

  constructor(raw: ServerResponse, runId: string) {
    this.raw = raw;
    this.runId = runId;
    this.heartbeat = setInterval(() => {
      this.writeRaw(encodeSseHeartbeat());
    }, heartbeatIntervalMs);
    this.heartbeat.unref();
  }

  send(event: TypedSseEvent): void {
    if (this.closed) {
      return;
    }
    this.sequence += 1;
    this.writeRaw(encodeSseEvent({ ...event, id: `${this.runId}:${this.sequence}` }));
  }

  end(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    clearInterval(this.heartbeat);
    if (!this.raw.writableEnded && !this.raw.destroyed) {
      this.raw.end();
    }
  }

  close(): void {
    this.closed = true;
    clearInterval(this.heartbeat);
  }

  get isClosed(): boolean {
    return this.closed || this.raw.destroyed || this.raw.writableEnded;
  }

  private writeRaw(chunk: string): void {
    if (this.isClosed) {
      return;
    }
    try {
      this.raw.write(chunk);
    } catch {
      this.close();
    }
  }
}
