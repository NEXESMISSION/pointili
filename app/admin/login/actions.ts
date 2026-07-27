"use server";

import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/auth/owner";
import { clearElevation, setElevation } from "@/lib/auth/elevate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ElevateState = { error?: string; ok?: boolean };

/**
 * Step up into the platform console.
 *
 * Re-verifies the PASSWORD of the already-signed-in super-admin. Possession of
 * the session is not sufficient to reach /admin — that's the entire point.
 *
 * Note it verifies against the session's OWN email; the form never chooses which
 * account to elevate, so this can't be used to hop into someone else's.
 */
export async function elevateAction(
  _prev: ElevateState,
  formData: FormData,
): Promise<ElevateState> {
  const owner = await currentOwner();
  if (!owner) redirect("/login");

  // Never reveal that /admin exists to a non-super-admin — same message either
  // way, and they'd fail the role check regardless.
  if (owner.role !== "super_admin") {
    return { error: "Accès refusé." };
  }

  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Mot de passe requis." };

  /*
    Verify with a THROWAWAY client, not the request's cookie-bound one.
    signInWithPassword() rotates the session; doing that on the live client would
    churn the owner's cookies on every step-up (and log them out on a typo).
    This checks the password without touching the existing session.
  */
  const probe = createAdminClient();
  const { error } = await probe.auth.signInWithPassword({
    email: owner.email ?? "",
    password,
  });

  if (error) {
    // A failed step-up on a super-admin account is worth recording.
    const db = createAdminClient();
    await db.rpc("admin_log", {
      p_actor: owner.id,
      p_action: "elevate_failed",
      p_business_id: null,
      p_detail: {},
    });
    return { error: "Mot de passe incorrect." };
  }

  /*
    scope: "local" is NOT optional.

    signOut() defaults to scope "global", which revokes EVERY refresh token for
    the user — so verifying your own password would sign you out of the owner app
    you were standing in. "local" only discards this throwaway client's copy;
    createAdminClient() sets persistSession:false, so nothing was stored anyway.
  */
  await probe.auth.signOut({ scope: "local" });

  await setElevation(owner.id);

  const db = createAdminClient();
  await db.rpc("admin_log", {
    p_actor: owner.id,
    p_action: "elevate",
    p_business_id: null,
    p_detail: {},
  });

  /*
    Deliberately NOT redirect().

    Getting here means the operator already tried /console and was bounced to
    this form, so the client Router Cache is holding the RSC payload of that
    bounce. A server redirect is a CLIENT navigation and would arrive at that
    cached login screen — elevation granted, console apparently still locked,
    fixed only by a manual reload.

    revalidatePath cannot clear it either: it addresses the internal route
    (/admin) while the router keys on the public URL (/console), and the host
    rewrite means those are different keys. So the form does a full document
    load, which no cache survives.
  */
  return { ok: true };
}

/** Drop elevation but stay signed in as an owner. */
export async function dropElevationAction() {
  await clearElevation();
  // No revalidatePath here either: it addresses the internal route (/admin)
  // while the router keys on the public one (/console). Locking redirects to the
  // till, a different page, so a stale console payload is never rendered.
  redirect("/");
}

/** Leave the console AND sign out entirely. */
export async function adminLogoutAction() {
  await clearElevation();
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
