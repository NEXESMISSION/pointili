"use server";

import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/auth/owner";
import { clearElevation, setElevation } from "@/lib/auth/elevate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ElevateState = { error?: string };

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
  if (!owner) redirect("/owner/login");

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

  redirect("/admin");
}

/** Drop elevation but stay signed in as an owner. */
export async function dropElevationAction() {
  await clearElevation();
  redirect("/owner");
}

/** Leave the console AND sign out entirely. */
export async function adminLogoutAction() {
  await clearElevation();
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
