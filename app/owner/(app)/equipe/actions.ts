"use server";

import { revalidatePath } from "next/cache";
import { hashPin, isValidPin, verifyPin, NO_SUCH_ACCOUNT_HASH } from "@/lib/auth/crypto";
import { currentOwner, ownerCafe } from "@/lib/auth/owner";
import {
  currentStaff,
  endStaffSession,
  logStaffAction,
  requireArea,
  startStaffSession,
  type StaffRole,
} from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";

/*
  THE TEAM, AND THE DOOR IT PUTS IN FRONT OF THE APP.

  Two kinds of action live here and they are guarded differently on purpose:

    · SIGNING IN is reachable by anyone holding the shop's session, because
      that is the whole point — the person at the counter has not said who they
      are yet, and the screen asking them is rendered before any other.

    · MANAGING THE TEAM is owner-only, enforced with requireArea("equipe") on
      every single one. A server action is a public HTTP endpoint; hiding the
      screen from a cashier's tab bar is a courtesy to them, not a gate.

  A cashier who could reach these could give themselves the owner role, or
  simply switch the whole system off and go back to being anonymous.
*/

type Result = { ok: boolean; error?: string };

const ROLES: StaffRole[] = ["owner", "manager", "cashier"];

/** Five wrong PINs in fifteen minutes and that tile stops accepting any. */
const MAX_TRIES = 5;
const WINDOW_MIN = 15;

/**
 * Say which person is holding the phone.
 *
 * The PIN is verified against a scrypt hash with a per-row salt, and a wrong
 * one is counted. There is no "which name did you mean" here — the tile was
 * already tapped, so this is one person and one secret, which is what makes a
 * lockout usable at a counter instead of locking out the whole shop.
 */
export async function signInAction(staffId: string, pin: string): Promise<Result> {
  const cafe = await ownerCafe();
  if (!cafe) return { ok: false, error: "Non autorisé." };
  if (!isValidPin(pin)) return { ok: false, error: "Le code doit contenir 4 chiffres." };

  const db = createAdminClient();
  const { data } = await db
    .from("staff")
    .select("id, name, role, pin_hash, active")
    .eq("id", staffId)
    .eq("business_id", cafe.id)
    .maybeSingle();

  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  if (data?.active) {
    const { count } = await db
      .from("staff_attempts")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", data.id)
      .gte("at", since);
    if ((count ?? 0) >= MAX_TRIES) {
      return { ok: false, error: `Trop d'essais — réessayez dans ${WINDOW_MIN} minutes.` };
    }
  }

  /*
    Burn the same scrypt whether or not that person exists.

    Without it, a tile id that has been deleted answers measurably sooner than a
    wrong PIN. It matters less here than on the diner login (the ids are not
    guessable and the caller is already inside the shop's session) but the cost
    is one constant and the habit is worth keeping.
  */
  const good = await verifyPin(pin, data?.active ? data.pin_hash : NO_SUCH_ACCOUNT_HASH);
  if (!data?.active || !good) {
    if (data?.active) await db.from("staff_attempts").insert({ staff_id: data.id });
    return { ok: false, error: "Code incorrect." };
  }

  await db.from("staff_attempts").delete().eq("staff_id", data.id);

  const staff = { id: data.id, name: data.name, role: data.role as StaffRole };
  await startStaffSession(staff, cafe.id);
  await logStaffAction(cafe.id, "sign_in", { staff });

  revalidatePath("/owner", "layout");
  return { ok: true };
}

/**
 * THE WAY BACK IN WHEN THE OWNER FORGETS THEIR OWN FOUR DIGITS.
 *
 * Without this the gate is a one-way door. Every screen that could reset a PIN
 * — Réglages, and the team page itself — is behind it, and the only role that
 * can open them is the one that just forgot how. A cashier's tile still works,
 * and a cashier cannot reach the settings, so the shop would be permanently
 * stuck with the till and no way to change anything about it. Nothing short of
 * the database would fix that.
 *
 * ── AND THE KEY IS THE ACCOUNT PASSWORD ───────────────────────────────────
 *
 * Not an email link, not a support ticket: the shop's own Supabase password,
 * which is the credential that ALREADY means "I am this business". Whoever
 * holds it is the owner by every definition this product has — they could sign
 * in on any other device and be the owner there.
 *
 * The person it keeps out is exactly the one this feature is about: a cashier
 * holding the counter phone has the SESSION, not the password. It is verified
 * against the auth server on a throwaway client that stores nothing, so this
 * cannot be turned into a way to swap the session for somebody else's.
 *
 * OWNER TILES ONLY. Letting the password open a cashier's tile would let the
 * one person who cannot be impersonated impersonate somebody who can — and put
 * their name on the afternoon.
 *
 * Rate-limited on the same counter as the PIN: this endpoint would otherwise be
 * an unthrottled password oracle, reachable by anyone holding the phone.
 */
export async function recoverAction(staffId: string, password: string): Promise<Result> {
  const cafe = await ownerCafe();
  if (!cafe) return { ok: false, error: "Non autorisé." };

  const me = await currentOwner();
  if (!me?.email) return { ok: false, error: "Non autorisé." };

  const db = createAdminClient();
  const { data } = await db
    .from("staff")
    .select("id, name, role, active")
    .eq("id", staffId)
    .eq("business_id", cafe.id)
    .maybeSingle();
  if (!data?.active || data.role !== "owner") {
    return { ok: false, error: "Ce mot de passe n'ouvre que le compte propriétaire." };
  }

  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const { count } = await db
    .from("staff_attempts")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", data.id)
    .gte("at", since);
  if ((count ?? 0) >= MAX_TRIES) {
    return { ok: false, error: `Trop d'essais — réessayez dans ${WINDOW_MIN} minutes.` };
  }

  /*
    A CLIENT THAT STORES NOTHING. persistSession:false means the successful
    sign-in below mints a token that is thrown away with this object — it never
    reaches a cookie, so verifying the password cannot also rotate or replace the
    session the browser is holding.
  */
  const { createClient: createAuthClient } = await import("@supabase/supabase-js");
  const auth = createAuthClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error } = await auth.auth.signInWithPassword({
    email: me.email,
    password: String(password ?? ""),
  });
  if (error) {
    await db.from("staff_attempts").insert({ staff_id: data.id });
    return { ok: false, error: "Mot de passe incorrect." };
  }

  await db.from("staff_attempts").delete().eq("staff_id", data.id);
  const staff = { id: data.id, name: data.name, role: "owner" as StaffRole };
  await startStaffSession(staff, cafe.id);
  await logStaffAction(cafe.id, "sign_in", { staff });

  revalidatePath("/owner", "layout");
  return { ok: true };
}

/**
 * The red button in the caisse.
 *
 * It exists because of one complaint, and the complaint is the feature: a
 * cashier lends the shop phone to whoever is on next, and every sale that
 * follows carries their name. Leaving has to be one tap from the screen they
 * are already looking at, or nobody does it and the record is worse than none.
 */
export async function signOutAction(): Promise<Result> {
  const cafe = await ownerCafe();
  if (cafe) {
    const staff = await currentStaff(cafe.id);
    if (staff) await logStaffAction(cafe.id, "sign_out", { staff });
  }
  await endStaffSession();
  revalidatePath("/owner", "layout");
  return { ok: true };
}

/* ── managing the team — owner only ─────────────────────────────────────── */

async function ownerOnly() {
  const cafe = await ownerCafe();
  if (!cafe) throw new Error("UNAUTHORISED");
  await requireArea(cafe.id, "equipe");
  return cafe;
}

/**
 * Turn the gate on or off.
 *
 * TURNING IT ON REQUIRES SOMEBODY WITH THE KEY, and the check is not a nicety:
 * the gate renders as soon as this flag is true, so switching it on with an
 * empty team locks the owner out of their own app with no tile to tap and no
 * screen behind it to fix the mistake from. There is no recovery path short of
 * the database.
 */
export async function setPinsEnabledAction(on: boolean): Promise<Result> {
  const cafe = await ownerOnly();
  const db = createAdminClient();

  if (on) {
    const { count } = await db
      .from("staff")
      .select("id", { count: "exact", head: true })
      .eq("business_id", cafe.id)
      .eq("active", true)
      .eq("role", "owner");
    if (!count) {
      return {
        ok: false,
        error: "Ajoutez d'abord une personne avec le rôle « Propriétaire » — sinon vous ne pourriez plus entrer.",
      };
    }
  }

  const { error } = await db.from("businesses").update({ staff_pins_enabled: on }).eq("id", cafe.id);
  if (error) return { ok: false, error: "Impossible d'enregistrer." };

  revalidatePath("/owner", "layout");
  return { ok: true };
}

export async function addStaffAction(name: string, pin: string, role: string): Promise<Result> {
  const cafe = await ownerOnly();
  const clean = String(name ?? "").trim();
  if (clean.length < 1 || clean.length > 40) return { ok: false, error: "Un prénom, entre 1 et 40 caractères." };
  if (!isValidPin(pin)) return { ok: false, error: "Le code doit contenir 4 chiffres." };
  if (!ROLES.includes(role as StaffRole)) return { ok: false, error: "Rôle inconnu." };

  const db = createAdminClient();
  const { error } = await db.from("staff").insert({
    business_id: cafe.id,
    name: clean,
    pin_hash: await hashPin(pin),
    role,
  });
  /* 23505 is the unique index on (business_id, lower(name)) — two identical
     tiles on the sign-in screen is a coin toss over who gets blamed. */
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Ce prénom est déjà pris — ajoutez une initiale." : "Impossible d'ajouter.",
    };
  }

  revalidatePath("/owner/equipe");
  return { ok: true };
}

export async function setStaffRoleAction(staffId: string, role: string): Promise<Result> {
  const cafe = await ownerOnly();
  if (!ROLES.includes(role as StaffRole)) return { ok: false, error: "Rôle inconnu." };

  const db = createAdminClient();
  /*
    THE LAST OWNER CANNOT DEMOTE THEMSELVES. Same hole as switching the gate on
    with nobody to open it: the screen that could put it right is the one this
    would make unreachable.
  */
  if (role !== "owner") {
    const { data: owners } = await db
      .from("staff")
      .select("id")
      .eq("business_id", cafe.id)
      .eq("active", true)
      .eq("role", "owner");
    if ((owners ?? []).length === 1 && owners![0].id === staffId) {
      return { ok: false, error: "C'est la seule personne qui peut ouvrir les réglages." };
    }
  }

  const { error } = await db
    .from("staff")
    .update({ role })
    .eq("id", staffId)
    .eq("business_id", cafe.id);
  if (error) return { ok: false, error: "Impossible d'enregistrer." };

  revalidatePath("/owner/equipe");
  return { ok: true };
}

export async function setStaffPinAction(staffId: string, pin: string): Promise<Result> {
  const cafe = await ownerOnly();
  if (!isValidPin(pin)) return { ok: false, error: "Le code doit contenir 4 chiffres." };

  const db = createAdminClient();
  const { error } = await db
    .from("staff")
    .update({ pin_hash: await hashPin(pin) })
    .eq("id", staffId)
    .eq("business_id", cafe.id);
  if (error) return { ok: false, error: "Impossible d'enregistrer." };

  /* A forgotten code is the usual reason to be here, and the lockout that came
     with the forgetting should not outlive it. */
  await db.from("staff_attempts").delete().eq("staff_id", staffId);

  revalidatePath("/owner/equipe");
  return { ok: true };
}

/**
 * Somebody left.
 *
 * DEACTIVATED, NOT DELETED. staff_actions.staff_id would go null on a delete
 * and the names would survive, but the row is also what the journal joins for
 * "how many actions" — and a shop that fires somebody on Friday should still be
 * able to read their Thursday. The tile disappears, the PIN stops working, and
 * the unique index only covers active rows, so the name can be reused.
 */
export async function removeStaffAction(staffId: string): Promise<Result> {
  const cafe = await ownerOnly();
  const db = createAdminClient();

  const { data: owners } = await db
    .from("staff")
    .select("id")
    .eq("business_id", cafe.id)
    .eq("active", true)
    .eq("role", "owner");
  if ((owners ?? []).length === 1 && owners![0].id === staffId) {
    return { ok: false, error: "C'est la seule personne qui peut ouvrir les réglages." };
  }

  const { error } = await db
    .from("staff")
    .update({ active: false })
    .eq("id", staffId)
    .eq("business_id", cafe.id);
  if (error) return { ok: false, error: "Impossible de retirer." };

  revalidatePath("/owner/equipe");
  return { ok: true };
}
