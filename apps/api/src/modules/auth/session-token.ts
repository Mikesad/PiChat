import { createHash, randomBytes } from "node:crypto";
import { sessionTtlSeconds } from "@pichat/shared";

export const sessionTokenBytes = 32;

export function createSessionToken(): string {
  return randomBytes(sessionTokenBytes).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + sessionTtlSeconds * 1000);
}

export function isSessionExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: sessionTtlSeconds,
    secure,
  };
}
