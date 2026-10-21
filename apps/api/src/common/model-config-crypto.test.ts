import { describe, expect, it } from "vitest";
import { ModelConfigCrypto, ModelConfigCryptoError } from "./model-config-crypto";

const keyA = Buffer.alloc(32, 7);
const keyB = Buffer.alloc(32, 9);

describe("model config crypto", () => {
  it("round-trips an API key without storing the plaintext", () => {
    const crypto = new ModelConfigCrypto(keyA);
    const plaintext = "sk-live-1234567890";
    const encrypted = crypto.encrypt(plaintext);

    expect(encrypted).not.toContain(plaintext);
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(encrypted.split(":")).toHaveLength(4);
    expect(crypto.decrypt(encrypted)).toBe(plaintext);
    expect(encrypted).not.toBe(crypto.encrypt(plaintext));
  });

  it("masks all but the last four characters", () => {
    const crypto = new ModelConfigCrypto(keyA);
    expect(crypto.mask("sk-live-1234567890")).toBe("****7890");
    expect(crypto.mask("abc")).toBe("****");
    expect(crypto.mask("")).toBe("");
  });

  it("fails to decrypt with a different key", () => {
    const encrypted = new ModelConfigCrypto(keyA).encrypt("sk-secret");
    expect(() => new ModelConfigCrypto(keyB).decrypt(encrypted)).toThrow(ModelConfigCryptoError);
  });

  it("rejects malformed keys and payloads", () => {
    expect(() => ModelConfigCrypto.fromEnvironment(undefined)).toThrow(ModelConfigCryptoError);
    expect(() => ModelConfigCrypto.fromEnvironment(Buffer.alloc(16).toString("base64"))).toThrow(
      ModelConfigCryptoError,
    );
    expect(() => new ModelConfigCrypto(keyA).decrypt("v1:bad")).toThrow(ModelConfigCryptoError);
  });
});
