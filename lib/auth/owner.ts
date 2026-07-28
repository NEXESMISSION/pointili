import "server-only";
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
 * The signed-in owner (Supabase Auth), or null.
 *
 * Uses getUser() rather than getSession(): getSession() reads the cookie without
 * revalidating it, so a forged cookie would pass. getUser() verifies against the
 * auth server. Never trust the cookie's contents for authorisation.
 */
export async function currentOwner(): Promise<OwnerSession | null> {
  if (!supabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

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
export async function ownerCafe() {
  const { getOwnedCafe, getAnyCafe } = await import("@/lib/data");
  const owner = await ownerAccess();
  if (!owner) return null;
  if (owner.dev) return getAnyCafe();
  return getOwnedCafe(owner.id);
}

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
export async function ownerAccess(): Promise<OwnerAccess | null> {
  const owner = await currentOwner();
  if (owner) return owner;

  if (!supabaseConfigured() && process.env.NODE_ENV !== "production") {
    return { id: "dev-owner", email: "dev@local", role: "owner", dev: true };
  }
  return null;
}

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

