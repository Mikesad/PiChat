import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  SessionManager as PiSessionManager,
  type SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { ChatRunHistoryMessage, InternalPrincipal } from "@pichat/shared";

const safeIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const zeroUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
};

export interface OpenSessionInput {
  dataDir: string;
  principal: InternalPrincipal;
  sessionId: string;
  history: ChatRunHistoryMessage[];
}

export interface OpenSessionResult {
  sessionManager: SessionManager;
  workspace: string;
  sessionDir: string;
  restored: boolean;
}

function assertSafeId(label: string, value: string): void {
  if (!safeIdPattern.test(value)) {
    throw new Error(`invalid_${label}`);
  }
}

export async function openPiSession(input: OpenSessionInput): Promise<OpenSessionResult> {
  assertSafeId("tenant_id", input.principal.tenantId);
  assertSafeId("user_id", input.principal.userId);
  assertSafeId("session_id", input.sessionId);

  const baseDir = join(
    input.dataDir,
    input.principal.tenantId,
    input.principal.userId,
    input.sessionId,
  );
  const workspace = join(baseDir, "workspace");
  const sessionDir = join(baseDir, "pi-sessions");

  await mkdir(workspace, { recursive: true });
  await mkdir(sessionDir, { recursive: true });

  const existing = PiSessionManager.findById(workspace, input.sessionId, sessionDir);
  if (existing) {
    return {
      sessionManager: PiSessionManager.open(existing, sessionDir, workspace),
      workspace,
      sessionDir,
      restored: true,
    };
  }

  const sessionManager = PiSessionManager.create(workspace, sessionDir, {
    id: input.sessionId,
  });
  for (const message of input.history.slice(-20)) {
    const content = message.content.trim();
    if (content.length === 0) {
      continue;
    }
    const timestamp = Number.isFinite(Date.parse(message.createdAt))
      ? Date.parse(message.createdAt)
      : Date.now();
    if (message.role === "user") {
      sessionManager.appendMessage({
        role: "user",
        content,
        timestamp,
      });
    } else {
      sessionManager.appendMessage({
        role: "assistant",
        content: [{ type: "text", text: content }],
        api: "pichat-history",
        provider: "pichat-history",
        model: "pichat-history",
        usage: zeroUsage,
        stopReason: "stop",
        timestamp,
      });
    }
  }

  return { sessionManager, workspace, sessionDir, restored: false };
}
