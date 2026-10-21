import { hashPassword, verifyPassword } from "@pichat/db";
import { describe, expect, it } from "vitest";

describe("password hashing", () => {
  it("stores scrypt salt and hash, never the plaintext", async () => {
    const encoded = await hashPassword("123456");

    expect(encoded).toMatch(/^scrypt\$[0-9a-f]{64}\$[0-9a-f]{128}$/);
    expect(encoded).not.toContain("123456");
  });

  it("verifies the correct password", async () => {
    const encoded = await hashPassword("123456");
    await expect(verifyPassword("123456", encoded)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const encoded = await hashPassword("123456");
    await expect(verifyPassword("654321", encoded)).resolves.toBe(false);
  });

  it("rejects malformed hashes", async () => {
    await expect(verifyPassword("123456", "plaintext")).resolves.toBe(false);
    await expect(verifyPassword("123456", "scrypt$zz$zz")).resolves.toBe(false);
    await expect(verifyPassword("123456", "bcrypt$aa$bb")).resolves.toBe(false);
  });
});
