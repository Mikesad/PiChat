import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

export const scryptParams = {
  N: 16384,
  r: 8,
  p: 1,
  keylen: 64,
} as const;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      scryptParams.keylen,
      {
        N: scryptParams.N,
        r: scryptParams.r,
        p: scryptParams.p,
        maxmem: 64 * 1024 * 1024,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32);
  const derivedKey = await deriveKey(password, salt);
  return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const saltHex = parts[1];
  const hashHex = parts[2];
  if (!saltHex || !hashHex || saltHex.length % 2 !== 0 || hashHex.length % 2 !== 0) {
    return false;
  }

  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== scryptParams.keylen) {
    return false;
  }

  try {
    const actual = await deriveKey(password, Buffer.from(saltHex, "hex"));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
