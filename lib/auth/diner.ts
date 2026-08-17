import "server-only";
import { cookies } from "next/headers";
import { signSession, verifySession } from "./crypto";

export const DINER_COOKIE = "pointili_diner";

/**
 * WHOSE PHONE THIS DEVICE BELONGS TO — not a session, and not a credential.
 *
 * ── the complaint this exists for ─────────────────────────────────────────
 * "I'm sure the card was added, but I open the link again later and it makes me
 * add it AGAIN." Nothing was ever lost — enrolment is idempotent and the points
 * were always there — but the SESSION was gone, and the only screen the product
 * had for someone without a session was "Nouveau compte": three fields, a fresh
 * secret code, and every visual signal of starting from zero. Of course it read
 * as the card being re-created.
 *
 * A session can end for reasons that have nothing to do with the customer: they
 * scanned the QR inside Instagram's browser this time and Safari last time,
 * they cleared their history, the phone dropped the cookie. What does NOT
 * change is which number that device belongs to.
 *
 * So the number is remembered separately, for far longer than any session, and
 * used for exactly one thing: showing "bon retour" and ONE field instead of a
 * signup form. It authorises nothing — the PIN is still the only key — and it
 * is httpOnly, so a script on the page cannot read it back.
 *
 * 400 days is the ceiling Chrome will store; anything longer is silently
 * truncated. That is deliberately much longer than the 90-day session: this
 * cookie's whole job is to outlive one.
 */
export const DINER_HINT = "pointili_last";
const HINT_DAYS = 400;
const SESSION_DAYS = 90;

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
    maxAge: SESSION_DAYS * 86400,
  });
}

/** Sign in AND remember the device, which is what every caller wants. */
export async function startDinerSession(phone: string) {
  await setDinerSession(signSession(phone, SESSION_DAYS));
  await rememberDevice(phone);
}

/*
  SIGNED, like the session — because of what the hint is allowed to unlock.

  This stored the bare phone number and lastDinerPhone() checked only its SHAPE.
  /rejoindre uses the hint to greet a returning customer by name, and to print
  the points they are holding at this shop, BEFORE any PIN is asked for. So
  anyone could set one cookie to somebody else's number and read back that
  person's first name and exact balance — and a Tunisian mobile is eight digits,
  which is not a search space, it is a afternoon.

  httpOnly never helped here: it stops a script on the page reading the cookie,
  and this attack is somebody sending one they wrote themselves.

  The same signSession/verifySession the identity token uses, so there is one
  signing story in this file rather than two. Hints written before this change
  hold a raw number, fail verification, and are simply ignored — the customer
  gets the ordinary signup screen and types their number, which is exactly what
  they would have got with no cookie at all.
*/
export async function rememberDevice(phone: string) {
  const jar = await cookies();
  jar.set(DINER_HINT, signSession(phone, HINT_DAYS), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: HINT_DAYS * 86400,
  });
}

/** The number this device last signed in with. NEVER treat this as identity. */
export async function lastDinerPhone(): Promise<string | null> {
  const jar = await cookies();
  const phone = verifySession(jar.get(DINER_HINT)?.value);
  return phone && /^\+\d{8,15}$/.test(phone) ? phone : null;
}

export async function clearDinerSession() {
  const jar = await cookies();
  jar.delete(DINER_COOKIE);
}

/**
 * "Ce n'est pas moi" — the only thing that should forget the number.
 *
 * Signing out on your own phone is not that: you sign out to hand the phone to
 * a friend, or because the screen said to, and coming back to "bon retour, ••• 123"
 * is right. Forgetting is an explicit act, so it has its own function.
 */
export async function forgetDevice() {
  const jar = await cookies();
  jar.delete(DINER_HINT);
}

/** The signed-in diner's phone, or null. Verified — never trusted raw. */
export async function currentDiner(): Promise<string | null> {
  const jar = await cookies();
  return verifySession(jar.get(DINER_COOKIE)?.value);
}
