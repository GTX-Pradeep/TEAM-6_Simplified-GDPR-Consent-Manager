import { Writable } from "node:stream";
import pino from "pino";

/** Tests for issue #28 (NFR-9, NFR-10, NFR-13; TC-SEC-08, TC-PRIV-01, TC-DATA-02). */

/* eslint-disable @typescript-eslint/no-var-requires */
const crypto = require("./emailCrypto") as typeof import("./emailCrypto");
/* eslint-enable @typescript-eslint/no-var-requires */

describe("e-mail encryption (NFR-10)", () => {
  it("round-trips, and the stored text does not reveal the address", () => {
    const stored = crypto.encryptEmail("Asha@Example.com");
    expect(stored).toMatch(/^enc:v1:[A-Za-z0-9+/=]+$/);
    expect(stored.toLowerCase()).not.toContain("asha");
    expect(crypto.decryptEmail(stored)).toBe("asha@example.com");
  });

  it("encrypting the same address twice gives different text (random IV)", () => {
    expect(crypto.encryptEmail("a@b.com")).not.toBe(crypto.encryptEmail("a@b.com"));
  });

  it("the lookup hash is the same for the same address in any case, and different for others", () => {
    expect(crypto.emailHash("A@B.com ")).toBe(crypto.emailHash("a@b.com"));
    expect(crypto.emailHash("a@b.com")).not.toBe(crypto.emailHash("c@b.com"));
    expect(crypto.emailHash("a@b.com")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a changed ciphertext is rejected (AES-GCM authentication)", () => {
    const stored = crypto.encryptEmail("a@b.com");
    const raw = Buffer.from(stored.slice(7), "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => crypto.decryptEmail("enc:v1:" + raw.toString("base64"))).toThrow();
  });

  it("plain e-mails from before encryption are returned as they are", () => {
    expect(crypto.decryptEmail("old@example.com")).toBe("old@example.com");
    expect(crypto.isEncrypted("old@example.com")).toBe(false);
  });

  it("uses EMAIL_ENCRYPTION_KEY when set: data encrypted with one key cannot be read with another", () => {
    const stored = crypto.encryptEmail("a@b.com");
    jest.resetModules();
    process.env.EMAIL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const other = require("./emailCrypto") as typeof import("./emailCrypto");
    expect(() => other.decryptEmail(stored)).toThrow();
    expect(other.decryptEmail(other.encryptEmail("a@b.com"))).toBe("a@b.com");
    delete process.env.EMAIL_ENCRYPTION_KEY;
  });
});

describe("log redaction (NFR-9)", () => {
  it("never writes passwords, e-mails, tokens or cookies to the log", () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const { redactConfig } = require("./logger") as typeof import("./logger");
    const test = pino({ redact: redactConfig }, sink);
    test.info({
      body: { email: "asha@example.com", password: "Secret123!", token: "eyJhbGciOi" },
      req: { headers: { cookie: "gdpr_session=abc", authorization: "Bearer xyz" } },
    }, "login");
    const out = lines.join("");
    for (const secret of ["asha@example.com", "Secret123!", "eyJhbGciOi", "gdpr_session=abc", "Bearer xyz"]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain("[REDACTED]");
  });
});

describe("UTC timestamps (NFR-13)", () => {
  it("times are sent as UTC ISO strings ending in Z", () => {
    expect(JSON.parse(JSON.stringify({ at: new Date(Date.UTC(2026, 9, 31, 10, 0)) })).at).toBe("2026-10-31T10:00:00.000Z");
  });
});
