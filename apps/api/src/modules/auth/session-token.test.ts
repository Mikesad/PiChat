import { describe, expect, it } from "vitest";
import {
  createSessionExpiry,
  createSessionToken,
  hashSessionToken,
  isSessionExpired,
} from "./session-token";

describe("session tokens", () => {
  it("creates a 32-byte base64url token", () => {
    const token = createSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createSessionToken()).not.toBe(token);
  });

  it("hashes tokens with sha256 without keeping the plaintext", () => {
    const token = "example-session-token";
    const hash = hashSessionToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashSessionToken(token)).toBe(hash);
  });

  it("expires sessions after seven days", () => {
    const now = new Date("2026-10-21T00:00:00.000Z");
    const expiry = createSessionExpiry(now);
    expect(expiry.toISOString()).toBe("2026-10-28T00:00:00.000Z");
    expect(isSessionExpired(expiry, now)).toBe(false);
    expect(isSessionExpired(expiry, new Date("2026-10-28T00:00:00.000Z"))).toBe(true);
  });
});
