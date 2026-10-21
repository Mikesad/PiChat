import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";

export interface CreatePiSessionInput {
  cwd: string;
}

export async function createPiSession(input: CreatePiSessionInput) {
  const { session } = await createAgentSession({
    cwd: input.cwd,
    sessionManager: SessionManager.inMemory(),
  });

  return session;
}
