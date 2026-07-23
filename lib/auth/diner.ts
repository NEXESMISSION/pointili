import "server-only";
import { cookies } from "next/headers";
import { verifySession } from "./crypto";

export const DINER_COOKIE = "pointili_diner";

/**
 * The spec (§04) says "signed token in localStorage". We keep the signed token
 * but store it in an httpOnly cookie instead: localStorage is readable by any
 * XSS on the page, and this token IS the diner's identity (their points). A
 * cookie the JS can't read removes that whole class of theft, and it's what lets
 * server components read the session during render.
 */
export async function setDinerSession(token: string) {
  const jar = await cookies();
  jar.set(DINER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 90 * 86400,
  });
}

export async function clearDinerSession() {
  const jar = await cookies();
  jar.delete(DINER_COOKIE);
}

/** The signed-in diner's phone, or null. Verified — never trusted raw. */
export async function currentDiner(): Promise<string | null> {
  const jar = await cookies();
  return verifySession(jar.get(DINER_COOKIE)?.value);
}
