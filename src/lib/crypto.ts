import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { isProductionRuntime } from "@/lib/runtime";

const ALGO = "aes-256-gcm";

const PLACEHOLDER_KEYS = new Set([
  "change-me-to-a-long-random-secret-key",
  "change-me",
  "changeme",
]);

function getKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be set (32+ characters). Generate with: openssl rand -base64 32",
    );
  }
  if (PLACEHOLDER_KEYS.has(secret)) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is still the example placeholder. Generate with: openssl rand -base64 32",
    );
  }
  if (isProductionRuntime() && secret.length < 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be at least 32 characters in production");
  }
  return createHash("sha256").update(secret).digest();
}

/** Encrypt a Plaid access token for at-rest storage. Format: iv:tag:ciphertext (hex). */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/** Decrypt a stored Plaid access token. */
export function decryptToken(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid encrypted token format");
  }
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
