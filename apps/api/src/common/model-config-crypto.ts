import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class ModelConfigCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigCryptoError";
  }
}

export class ModelConfigCrypto {
  private readonly key: Buffer;

  constructor(key: Buffer) {
    if (key.length !== KEY_BYTES) {
      throw new ModelConfigCryptoError(
        "MODEL_CONFIG_ENCRYPTION_KEY must be a 32-byte base64 value",
      );
    }
    this.key = key;
  }

  static fromEnvironment(value: string | undefined): ModelConfigCrypto {
    if (!value || value.trim().length === 0) {
      throw new ModelConfigCryptoError(
        "MODEL_CONFIG_ENCRYPTION_KEY is not configured; model API keys cannot be stored",
      );
    }

    const key = Buffer.from(value.trim(), "base64");
    if (key.length !== KEY_BYTES) {
      throw new ModelConfigCryptoError(
        "MODEL_CONFIG_ENCRYPTION_KEY must decode to exactly 32 bytes",
      );
    }
    return new ModelConfigCrypto(key);
  }

  encrypt(apiKey: string): string {
    if (apiKey.length === 0) {
      throw new ModelConfigCryptoError("API key must not be empty");
    }
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      iv.toString("base64"),
      tag.toString("base64"),
      ciphertext.toString("base64"),
    ].join(":");
  }

  decrypt(payload: string): string {
    const parts = payload.split(":");
    if (parts.length !== 4 || parts[0] !== VERSION) {
      throw new ModelConfigCryptoError("Unsupported encrypted API key format");
    }

    const iv = Buffer.from(parts[1] ?? "", "base64");
    const tag = Buffer.from(parts[2] ?? "", "base64");
    const ciphertext = Buffer.from(parts[3] ?? "", "base64");
    if (iv.length !== IV_BYTES || tag.length !== 16 || ciphertext.length === 0) {
      throw new ModelConfigCryptoError("Encrypted API key is malformed");
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      throw new ModelConfigCryptoError("Unable to decrypt API key");
    }
  }

  mask(apiKey: string): string {
    const trimmed = apiKey.trim();
    if (trimmed.length === 0) {
      return "";
    }
    if (trimmed.length <= 4) {
      return "****";
    }
    return `****${trimmed.slice(-4)}`;
  }
}
