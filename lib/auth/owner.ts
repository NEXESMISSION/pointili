import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type OwnerSession = {
  id: string;
  email: string | null;
  role: "owner" | "super_admin";
};

/** True once Supabase env vars are present. */
export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * The verified Supabase user — the single network hop, once per request.
 *
 * Split out of currentOwner() so that WHICH CAFÉ and WHAT ROLE stop being
 * sequential. The café lookup only ever needed the user id; going through
 * currentOwner() made it wait for the profiles SELECT first, so a page asking
 * for both did three round trips in a row instead of one and then two at once.
 */
const authUser = cache(async function authUser() {
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();

  /*
    ── VERIFIED LOCALLY, NOT OVER THE NETWORK ────────────────────────────
    getUser() asks the auth server on every call, and it is the FIRST thing
    every owner screen does — so every till page, every settings page and every
    server action began with a 100–150ms round trip before it could read
    anything, to answer a question the token already answers.

    getClaims() verifies the token's SIGNATURE locally with WebCrypto against
    the project's JWKS (ES256 here — checked against the well-known endpoint),
    fetching the key set once and caching it. This is NOT getSession(): a
    tampered or unsigned cookie fails verification, which is the property the
    note on currentOwner() is about. If the project ever moves to a symmetric
    secret, this call falls back to asking the server, so it stays correct
    rather than becoming insecure.

    WHAT IT COSTS, plainly: revocation stops being instant. A session signed
    out elsewhere keeps working until its access token expires — up to an hour.
    For a till that is the right trade. For the console it is not, which is why
    requireSuperAdmin() below still pays for a live check.
  */
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: String(claims.sub), email: (claims.email as string | undefined) ?? null };
});

/**
 * The same question, asked of the auth SERVER — no local shortcut.
 *
 * The console gate only. That surface can take a shop offline, so a revoked
 * session has to stop working when it is revoked, not when its token happens
 * to expire.
 */
const liveUser = cache(async function liveUser() {
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
});

/*
  ── AND A NOTE ON MEASURING THIS, WHICH COST ME AN AFTERNOON ─────────────
  A 307 to /owner/login is faster to serve than the till. So if this function
  ever answers null by mistake, every owner page redirects and the numbers
  IMPROVE — /owner "went from 587ms to 420ms" while being completely broken.

  Measure the RENDERED PAGE. Assert something that only exists on the real
  screen (the till's `input[name="customer"]`), never time-to-first-byte alone.
*/

/**
 * The signed-in owner (Supabase Auth), or null.
 *
 * The token is VERIFIED, never merely read — authUser() checks its signature
 * (see there). getSession() would read the cookie without checking anything and
 * a forged one would pass; that is the line this must not cross, and does not.
 *
 * cache(): resolving the user costs a profiles SELECT, and every owner
 * screen asked the same question several times per request — the layout resolves
 * the café, the page resolves it again, ownerHome() asks a third time, and each
 * of those went through here plus a profiles SELECT. Measured on the till, that
 * was five round trips to answer "who is this?" once. React's cache dedupes them
 * within a single request and nothing else changes: a new request still
 * revalidates the token from scratch, which is the security property.
 */
export const currentOwner = cache(async function currentOwner(): Promise<OwnerSession | null> {
  const user = await authUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? null,
    role: (profile?.role as OwnerSession["role"]) ?? "owner",
  };
});

/**
 * Is there an owner session cookie on this device? PRESENCE ONLY — this does
 * NOT prove anything and must never gate access.
 *
 * It exists for one job: the landing page has to decide, without a network
 * round trip, whether a visitor holding a diner cookie is a customer heading
 * for their wallet or a shop owner heading for their till. Since the host split
 * was removed both cookies arrive on the same origin, so "has a diner cookie"
 * stopped being enough to answer that.
 *
 * Supabase names its cookies `sb-<project-ref>-auth-token`, optionally chunked
 * with a `.0` / `.1` suffix when the token outgrows one cookie — so match the
 * prefix, never an exact name.
 *
 * Use currentOwner() for anything that grants access; it verifies with the auth
 * server. A forged cookie here wins nothing but the sight of the sales page.
 */
export async function hasOwnerCookie(): Promise<boolean> {
  const jar = await cookies();
  return jar.getAll().some(
    (c) =>
      c.name.startsWith("sb-") &&
      c.name.includes("auth-token") &&
      /*
        NOT the PKCE verifier. auth-js writes `sb-<ref>-auth-token-code-verifier`
        at the START of a signup or password-reset flow and only removes it when
        the exchange completes — so an abandoned signup leaves behind a cookie
        whose name satisfies the two tests above and which is not a session at
        all. A diner on that browser was then routed to the owner login screen
        instead of their wallet.
      */
      !c.name.endsWith("-code-verifier") &&
      /*
        AND it must actually hold something. An empty value used to count, which
        is how the deleted-then-resurrected cookie (see proxy.ts) turned one
        expired token into a permanent redirect to /owner/login: "/" saw the
        name, sent them to /owner, /owner found no session and sent them back to
        the login screen — on every launch of the installed app, forever.
      */
      c.value.length > 0,
  );
}

export async function requireOwner(): Promise<OwnerSession> {
  const owner = await currentOwner();
  if (!owner) throw new Error("UNAUTHORISED");
  return owner;
}

export type OwnerAccess = OwnerSession & { dev?: true };

/**
 * The café the signed-in owner manages.
 *
 * Every owner screen and action resolves the café through here, so a request can
 * only ever touch the caller's OWN business — there is no café id in any URL or
 * form to tamper with.
 *
 * In the dev bypass (no Supabase configured, dev build only) this falls back to
 * the first café so the caisse can be exercised locally.
 */
export const ownerCafe = cache(async function ownerCafe() {
  const { getOwnedCafe, getAnyCafe } = await import("@/lib/data");
  /* authUser(), not ownerAccess(): the café is keyed on the user id alone, and
     waiting for the role query first put a whole round trip in front of it. */
  const user = await authUser();
  if (user) return getOwnedCafe(user.id);
  if (!supabaseConfigured() && process.env.NODE_ENV !== "production") return getAnyCafe();
  return null;
});

/**
 * DEV-ONLY BYPASS. Lets the owner app (and the caisse) be exercised before a
 * Supabase project exists.
 *
 * Guarded by BOTH conditions on purpose:
 *   - `NODE_ENV !== "production"` — dead in any production build, full stop.
 *   - `!supabaseConfigured()` — the moment real auth is available it takes over.
 *
 * Returns null when the caller must send the visitor to /owner/login.
 */
export const ownerAccess = cache(async function ownerAccess(): Promise<OwnerAccess | null> {
  const owner = await currentOwner();
  if (owner) return owner;

  if (!supabaseConfigured() && process.env.NODE_ENV !== "production") {
    return { id: "dev-owner", email: "dev@local", role: "owner", dev: true };
  }
  return null;
});

/**
 * Where a signed-in account belongs the moment it arrives.
 *
 * A PLATFORM OPERATOR is not a shop. A super-admin with no café of their own —
 * which is what a dedicated operator account should be — used to be told to
 * "créez votre café" by every screen in the owner app, because the only branch
 * was "has a café / does not". They would then either create a junk café to get
 * past it, or never find the console at all.
 *
 * So the question is not "do you have a café" but "what are you here to do".
 */
export async function ownerHome(): Promise<string> {
  const owner = await ownerAccess();
  if (!owner) return "/owner/login";
  if (await ownerCafe()) return "/owner";
  // No café: an operator goes to the console, a shop owner goes to set one up.
  return owner.role === "super_admin" ? "/admin" : "/owner/nouveau";
}

export async function requireSuperAdmin(): Promise<OwnerSession> {
  const owner = await requireOwner();
  if (owner.role !== "super_admin") throw new Error("FORBIDDEN");

  /*
    THE CONSOLE PAYS FOR A LIVE CHECK, and it is the only thing that does.
    Everywhere else the token is verified locally (authUser), because a shop's
    own till cannot afford a network round trip in front of every screen. This
    surface can take a business offline, so "was this session revoked?" is
    asked of the auth server rather than inferred from a token that is still
    cryptographically valid.
  */
  const live = await liveUser();
  if (!live || live.id !== owner.id) throw new Error("UNAUTHORISED");
  return owner;
}

/**
 * The gate for EVERY platform action.
 *
 * Being a signed-in super-admin IS the gate. There is no second password
 * screen: the console used to demand a step-up re-authentication with a
 * 30-minute window, which meant an operator typed the same password twice to
 * reach their own tool, and got thrown out mid-task when the clock ran down.
 *
 * What that bought is worth naming, because it is now gone: a STOLEN owner
 * session can reach the console. What still stands is the part that mattered
 * more — profiles.role is not writable by anyone (0021), so the role cannot be
 * self-issued, and every admin_* RPC re-checks is_super(p_actor) in Postgres,
 * so the UI is never the thing holding the door.
 */
export async function requireElevatedSuperAdmin(): Promise<OwnerSession> {
  return requireSuperAdmin();
}

