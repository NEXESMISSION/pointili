import "server-only";
import {
  createHmac,
  randomBytes,
  scrypt as _scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (
  pw: string,
  salt: string,
  len: number,
) => Promise<Buffer>;

/* -------------------------------------------------------------------------- */
/* PIN hashing                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A 4-digit PIN has only 10k possibilities, so the hash MUST be slow — a fast
 * hash (sha256) would fall to a full sweep instantly. scrypt with a per-account
 * salt is the defence. Rate-limiting attempts is the other half (see verifyPin
 * callers).
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(pin, salt, 64);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const key = await scrypt(pin, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
}

/* -------------------------------------------------------------------------- */
/* Session tokens                                                              */
/* -------------------------------------------------------------------------- */

type SessionPayload = { phone: string; iat: number; exp: number };

function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function unb64url(input: string) {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function secret() {
  const s = process.env.DINER_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "DINER_SESSION_SECRET is missing or too short — set it in .env.local",
    );
  }
  return s;
}

function sign(data: string) {
  return b64url(createHmac("sha256", secret()).update(data).digest());
}

/** Signed, tamper-evident diner session token (HMAC-SHA256). */
export function signSession(phone: string, days = 90): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    phone,
    iat: now,
    exp: now + days * 86400,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

/** Returns the phone if the token is authentic and unexpired, else null. */
export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;

  // constant-time compare — never leak signature validity via timing
  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(unb64url(body).toString()) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.phone;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Phone normalisation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Phone is the diner's global primary key (§04), so "20123456", "20 12 34 56"
 * and "+216 20 123 456" MUST collapse to one identity or a diner would silently
 * grow duplicate accounts and lose their points.
 */
export function normalisePhone(raw: string, defaultCountry = "216"): string {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else {
    /*
      Bare number → add the country code, UNLESS it's already there.

      Phones are often stored as "21620123456" (country code, no plus). Blindly
      prefixing turned that into +21621620123456 — a second, valid-looking
      identity for the same person, so a returning diner silently got a new empty
      account and lost their points. A local Tunisian number is 8 digits, so
      anything longer that already starts with the code is the no-plus form.
    */
    const local = digits.replace(/^0+/, "");
    digits =
      local.length > 8 && local.startsWith(defaultCountry)
        ? local
        : defaultCountry + local;
  }
  return `+${digits}`;
}

export function isValidPhone(normalised: string): boolean {
  return /^\+\d{8,15}$/.test(normalised);
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
