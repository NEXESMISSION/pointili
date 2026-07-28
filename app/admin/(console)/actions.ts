"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireElevatedSuperAdmin } from "@/lib/auth/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AdminState = { error?: string; ok?: string };

/**
 * Turn a guard failure into something the operator can act on.
 *
 * "Non autorisé." was shown for every failure, including an expired session —
 * which told the user nothing and looked like a permissions bug when it was
 * really "log in again". Each cause gets its own instruction.
 */
function guardMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  // NEEDS_ELEVATION is gone with the step-up screen, but a stale in-flight
  // request can still carry it — treat it as "sign in again", which is now true.
  if (m === "NEEDS_ELEVATION" || m === "UNAUTHORISED") {
    return "Session expirée — reconnectez-vous.";
  }
  if (m === "UNAUTHORISED") {
    return "Session expirée — reconnectez-vous.";
  }
  return "Non autorisé.";
}

/**
 * Super-admin actions.
 *
 * Guarded three ways: an unexpired step-up here, the role re-checked inside the
 * RPC, and EXECUTE revoked from anon/authenticated. Every action is written to
 * admin_audit with the actor's email — there is always a record of who
 * suspended whom.
 *
 * If the elevation has lapsed mid-session the action fails closed rather than
 * running with a stale grant.
 */

export async function setPlanAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  let me;
  try {
    me = await requireElevatedSuperAdmin();
  } catch (e) {
    return { error: guardMessage(e) };
  }

  const businessId = String(formData.get("businessId") ?? "");
  const plan = String(formData.get("plan") ?? "");
  const amount = Number(formData.get("amount") ?? 1);
  const unit = String(formData.get("unit") ?? "months");

  if (!businessId || !["trial", "free", "pro"].includes(plan)) {
    return { error: "Formule invalide." };
  }
  if (!["hours", "days", "months"].includes(unit)) {
    return { error: "Unité invalide." };
  }
  if (!Number.isInteger(amount) || amount < 0 || amount > 1000) {
    return { error: "Durée : 0 à 1000." };
  }

  const db = createAdminClient();
  const { data, error } = await db.rpc("admin_set_plan", {
    p_actor: me.id, // from the session — never from the form
    p_business_id: businessId,
    p_plan: plan,
    p_amount: amount,
    p_unit: unit,
  });
  if (error || !(data as { ok: boolean })?.ok) {
    return { error: "Impossible de changer la formule." };
  }

  revalidatePath("/admin");
  revalidatePath("/owner");
  const label = { hours: "h", days: "j", months: "mois" }[unit];
  return {
    ok:
      plan === "free"
        ? "Formule gratuite (illimitée) appliquée."
        : amount === 0
          ? "Expiré immédiatement."
          : `${plan} · +${amount} ${label}.`,
  };
}

export async function setSuspendedAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  let me;
  try {
    me = await requireElevatedSuperAdmin();
  } catch (e) {
    return { error: guardMessage(e) };
  }

  const businessId = String(formData.get("businessId") ?? "");
  const suspend = formData.get("suspend") === "1";
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);

  if (!businessId) return { error: "Café introuvable." };
  // Suspending is destructive to a live business — never do it namelessly.
  if (suspend && !reason) return { error: "Une raison est obligatoire." };

  const db = createAdminClient();
  const { data, error } = await db.rpc("admin_set_suspended", {
    p_actor: me.id,
    p_business_id: businessId,
    p_suspended: suspend,
    p_reason: reason || null,
  });
  if (error || !(data as { ok: boolean })?.ok) {
    return { error: "Action impossible." };
  }

  revalidatePath("/admin");
  return { ok: suspend ? "Café suspendu." : "Café réactivé." };
}

export async function noticeAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  let me;
  try {
    me = await requireElevatedSuperAdmin();
  } catch (e) {
    return { error: guardMessage(e) };
  }

  const businessId = String(formData.get("businessId") ?? "");
  const kind = String(formData.get("kind") ?? "info");
  const message = String(formData.get("message") ?? "").trim().slice(0, 500);
  const days = Number(formData.get("days") ?? 14);

  if (!message) return { error: "Message vide." };
  if (!["info", "warning", "urgent"].includes(kind)) {
    return { error: "Type invalide." };
  }

  const db = createAdminClient();
  const { data, error } = await db.rpc("admin_notice", {
    p_actor: me.id,
    // empty string → everyone
    p_business_id: businessId || null,
    p_kind: kind,
    p_message: message,
    p_days: Number.isInteger(days) ? days : 14,
  });
  if (error || !(data as { ok: boolean })?.ok) {
    return { error: "Envoi impossible." };
  }

  revalidatePath("/admin");
  return { ok: businessId ? "Message envoyé." : "Message envoyé à tous." };
}

/**
 * Retract a posted notice. A wrong or resolved broadcast used to be stuck on
 * every owner's dashboard until expiry — this pulls it back immediately.
 */
export async function dismissNoticeAction(id: string): Promise<void> {
  let me;
  try {
    me = await requireElevatedSuperAdmin();
  } catch {
    return; // fail closed; the notice simply stays
  }
  if (!id) return;

  const db = createAdminClient();
  await db.rpc("admin_dismiss_notice", { p_actor: me.id, p_id: id });

  revalidatePath("/admin");
  revalidatePath("/owner"); // the owner's banner should disappear too
}

/**
 * Leave the console and sign out entirely.
 *
 * Lives here rather than under /admin/login, which no longer exists: signing in
 * once at /owner/login is the only door to the console now.
 */
export async function adminLogoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/**
 * One-tap renewal from the work queue.
 *
 * A plain <form action={…}> passes only FormData, while setPlanAction has the
 * useActionState signature (prev, formData). This adapts it, so the queue can
 * offer "+6 mois" as a single button instead of making the operator open a
 * drawer and fill three fields to do the most common thing on the screen.
 */
export async function quickRenewAction(formData: FormData): Promise<void> {
  await setPlanAction({}, formData);
}

/** Lift a suspension from the queue, without opening the drawer. */
export async function quickUnsuspendAction(formData: FormData): Promise<void> {
  await setSuspendedAction({}, formData);
}
