import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Step-up authentication for the platform console.
 *
 * WHY THIS EXISTS
 *
 * A super-admin used to be just an owner with a flag: same login, same session,
 * same cookie. That means the blast radius of ONE leaked owner session is every
 * café on the platform — suspend anyone, grant free plans, read every ledger.
 * A long-lived session is fine for "manage my café". It is not fine for "disable
 * someone's business".
 *
 * So /admin needs a second, deliberate act:
 *   1. You must already be signed in AND have profiles.role = 'super_admin'.
 *   2. You must re-enter your password at /admin/login.
 *   3. That grants a SEPARATE, short-lived cookie — 30 minutes, not 90 days.
 *
 * The elevation cookie is bound to the user id, so it cannot be replayed under
 * another account, and it is signed with its OWN secret: the diner session
 * secret leaking must not mint admin access.
 *
 * This is the "sudo mode" pattern (GitHub, AWS). Possession of a stolen session
 * is no longer enough — you also need the password, recently.
 */

export const ADMIN_COOKIE = "pointili_admin";

/** 30 minutes. Long enough to do the work, short enough to be worth stealing. */
const TTL_SECONDS = 30 * 60;

type Payload = { sub: string; exp: number };

function secret(): string {
  // Deliberately NOT DINER_SESSION_SECRET: separate purpose, separate key.
  const s = process.env.ADMIN_STEPUP_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "ADMIN_STEPUP_SECRET is missing or too short — set it in .env.local",
    );
  }
  return s;
}

function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(body: string) {
  return b64url(createHmac("sha256", secret()).update(`admin:${body}`).digest());
}

export function signElevation(userId: string): string {
  const body = b64url(
    JSON.stringify({
      sub: userId,
      exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    } satisfies Payload),
  );
  return `${body}.${sign(body)}`;
}

/** The elevated user id, or null. Verified — never trusted raw. */
export function verifyElevation(token: string | undefined): string | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;

  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  // constant-time: never leak signature validity through timing
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const p = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    ) as Payload;
    if (p.exp < Math.floor(Date.now() / 1000)) return null;
    return p.sub;
  } catch {
    return null;
  }
}

export async function setElevation(userId: string) {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, signElevation(userId), {
    httpOnly: true,
    sameSite: "strict", // stricter than the owner session: no cross-site sends at all
    secure: process.env.NODE_ENV === "production",
    path: "/admin",     // scoped: never sent to the owner app or the diner app
    maxAge: TTL_SECONDS,
  });
}

export async function clearElevation() {
  const jar = await cookies();
  jar.delete({ name: ADMIN_COOKIE, path: "/admin" });
}

/**
 * Is the CURRENT super-admin elevated?
 *
 * Takes the expected user id so a token minted for another account is useless
 * even if the cookie is copied across sessions.
 */
export async function isElevated(expectUserId: string): Promise<boolean> {
  const jar = await cookies();
  const sub = verifyElevation(jar.get(ADMIN_COOKIE)?.value);
  return sub !== null && sub === expectUserId;
}

/** Seconds left on the elevation, or 0. Used to warn before it lapses. */
export async function elevationRemaining(): Promise<number> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token || !verifyElevation(token)) return 0;
  try {
    const [body] = token.split(".");
    const p = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    ) as Payload;
    return Math.max(0, p.exp - Math.floor(Date.now() / 1000));
  } catch {
    return 0;
  }
}
