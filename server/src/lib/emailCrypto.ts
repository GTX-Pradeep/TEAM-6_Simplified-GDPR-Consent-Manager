import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { config } from "../config";

/**
 * NFR-10: e-mail addresses are stored encrypted (AES-256-GCM) in users.email, so a database
 * dump or a backup file does not show them. Because encryption is random (new IV each time),
 * the same address gives a different text every time; to find a user by e-mail we also store
 * users.email_hash = HMAC-SHA256(address), which is unique and cannot be turned back into it.
 */

const PREFIX = "enc:v1:";

function masterKey(): Buffer {
  if (config.EMAIL_ENCRYPTION_KEY) return Buffer.from(config.EMAIL_ENCRYPTION_KEY, "base64");
  return Buffer.from(config.JWT_SECRET, "utf8");
}

/** Two independent keys from one secret: one to encrypt, one to hash. */
const derive = (info: string) => Buffer.from(hkdfSync("sha256", masterKey(), "gdpr-consent-manager", info, 32));
let keys: { enc: Buffer; mac: Buffer } | null = null;
function getKeys() {
  keys ??= { enc: derive("email-encryption-v1"), mac: derive("email-lookup-v1") };
  return keys;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** "enc:v1:" + base64(12-byte IV | 16-byte auth tag | ciphertext) */
export function encryptEmail(email: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKeys().enc, iv);
  const ct = Buffer.concat([cipher.update(normaliseEmail(email), "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

/** Plain address. Rows saved before encryption existed are returned unchanged. */
export function decryptEmail(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", getKeys().enc, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/** Deterministic lookup value for an address (same address -> same hash). */
export function emailHash(email: string): string {
  return createHmac("sha256", getKeys().mac).update(normaliseEmail(email), "utf8").digest("hex");
}

/** Values to store for an address. */
export function protectEmail(email: string): { email: string; emailHash: string } {
  return { email: encryptEmail(email), emailHash: emailHash(email) };
}

/** Returns a copy of an object whose `email` field is decrypted. */
export function withPlainEmail<T extends { email: string }>(row: T): T {
  return { ...row, email: decryptEmail(row.email) };
}

/** For tests only: forget cached keys after changing the config. */
export function _resetKeysForTests() {
  keys = null;
}
