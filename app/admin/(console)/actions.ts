"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireElevatedSuperAdmin } from "@/lib/auth/owner";
import { adminWrite } from "@/lib/adminRpc";
import { createClient } from "@/lib/supabase/server";

export type AdminState = { error?: string; ok?: string };

/** What the row looks like AFTER the write — the only thing worth reporting. */
type PostState = { ok: boolean; live?: boolean; until?: string | null; reason?: string };

/**
 * Turn the post-state into a sentence.
 *
 * Deliberately built from what came BACK, never from what was sent. The console
 * used to compose its confirmation from the form values, in a branch order that
 * did not match Postgres's — so "Gratuit" with duration 0 announced
 * « illimitée » at the moment it took the café dark.
 */
function verdict(r: PostState, done: string): string {
  const until = r.until ? new Date(r.until) : null;
  const dark = r.live === false;
  const when = until
    ? until.getTime() <= Date.now()
      ? "expiré"
      : `jusqu'au ${until.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`
    : "sans limite";
  return dark ? `${done} — le café est HORS LIGNE (${when}).` : `${done} — en ligne, ${when}.`;
}

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
  /* The gate is inside adminWrite now — this one stays to TRANSLATE it: a
     server action that lets UNAUTHORISED escape shows the operator a red
     error boundary instead of "reconnectez-vous". */
  try {
    await requireElevatedSuperAdmin();
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

  const { data, error } = await adminWrite<PostState>("admin_set_plan", {
    p_business_id: businessId,
    p_plan: plan,
    p_amount: amount,
    p_unit: unit,
  });
  const res = data as PostState | null;
  if (error || !res?.ok) {
    return { error: res?.reason === "introuvable" ? "Café introuvable." : "Impossible de changer la formule." };
  }

  revalidatePath("/admin");
  revalidatePath("/owner");
  return {
    ok: verdict(res, `Formule « ${plan} »`),
  };
}

export async function setSuspendedAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  /* The gate is inside adminWrite now — this one stays to TRANSLATE it: a
     server action that lets UNAUTHORISED escape shows the operator a red
     error boundary instead of "reconnectez-vous". */
  try {
    await requireElevatedSuperAdmin();
  } catch (e) {
    return { error: guardMessage(e) };
  }

  const businessId = String(formData.get("businessId") ?? "");
  const suspend = formData.get("suspend") === "1";
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);

  if (!businessId) return { error: "Café introuvable." };
  // Suspending is destructive to a live business — never do it namelessly.
  if (suspend && !reason) return { error: "Une raison est obligatoire." };

  const { data, error } = await adminWrite<PostState>("admin_set_suspended", {
    p_business_id: businessId,
    p_suspended: suspend,
    p_reason: reason || null,
  });
  const res = data as PostState | null;
  if (error || !res?.ok) {
    return { error: res?.reason === "introuvable" ? "Café introuvable." : "Action impossible." };
  }

  revalidatePath("/admin");
  /* Reactivating does NOT necessarily make a café live — its subscription may
     have expired while it was off. verdict() reads that from the row. */
  return { ok: verdict(res, suspend ? "Café suspendu" : "Suspension levée") };
}

export async function noticeAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  /* The gate is inside adminWrite now — this one stays to TRANSLATE it: a
     server action that lets UNAUTHORISED escape shows the operator a red
     error boundary instead of "reconnectez-vous". */
  try {
    await requireElevatedSuperAdmin();
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

  const { data, error } = await adminWrite<PostState>("admin_notice", {
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
  try {
    await requireElevatedSuperAdmin();
  } catch {
    return; // fail closed; the notice simply stays
  }
  if (!id) return;

  await adminWrite("admin_dismiss_notice", { p_id: id });

  revalidatePath("/admin");
  revalidatePath("/owner"); // the owner's banner should disappear too
}

/* -------------------------------------------------------------------------- */
/* The shop: its identity, its owner, its programme, its existence             */
/* -------------------------------------------------------------------------- */

/**
 * Rename a shop, move its address, change its category or its colour.
 *
 * Every field is optional and an untouched one is sent as null, so the same
 * action serves "fix the accent in my name" and a full rewrite. The SLUG is the
 * one that matters: it is printed on stickers, and the interface says so — this
 * only makes sure the change is legal and recorded.
 */
export async function updateShopAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await requireElevatedSuperAdmin();
  } catch (e) {
    return { error: guardMessage(e) };
  }

  const id = String(formData.get("businessId") ?? "");
  if (!id) return { error: "Café introuvable." };

  const pick = (k: string) => {
    const v = formData.get(k);
    return v === null ? null : String(v).trim();
  };

  const { data, error } = await adminWrite<{ ok?: boolean; reason?: string; slug?: string }>(
    "admin_update_shop",
    {
      p_id: id,
      p_name: pick("name"),
      p_slug: pick("slug"),
      p_phone: pick("phone"),
      p_type: pick("type"),
      p_color: pick("color"),
    },
  );
  const res = data as { ok?: boolean; reason?: string; slug?: string } | null;
  if (error || !res?.ok) {
    return { error: SHOP_ERRORS[res?.reason ?? ""] ?? "Modification impossible." };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/cafes/${id}`);
  revalidatePath("/owner");
  /* The shop's own public page too — its name and colours are on it. */
  if (res.slug) revalidatePath(`/${res.slug}`);
  return { ok: "Enregistré." };
}

const SHOP_ERRORS: Record<string, string> = {
  introuvable: "Café introuvable.",
  bad_name: "Le nom doit faire entre 2 et 60 caractères.",
  slug_invalid: "Adresse invalide : minuscules, chiffres et tirets.",
  slug_reserved: "Cette adresse est réservée par la plateforme.",
  slug_taken: "Cette adresse est déjà prise par un autre café.",
  bad_color: "Couleur invalide (format #a1b2c3).",
  no_account: "Aucun compte Pointili avec cet email — il doit s'inscrire d'abord.",
  mismatch: "L'adresse saisie ne correspond pas.",
};

/** Hand a shop to another account, by the email its new owner signs in with. */
export async function transferShopAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await requireElevatedSuperAdmin();
  } catch (e) {
    return { error: guardMessage(e) };
  }

  const id = String(formData.get("businessId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (!id) return { error: "Café introuvable." };
  if (!email.includes("@")) return { error: "Email invalide." };

  const { data, error } = await adminWrite<{ ok?: boolean; reason?: string; to?: string }>(
    "admin_transfer_shop",
    { p_id: id, p_email: email },
  );
  const res = data as { ok?: boolean; reason?: string; to?: string } | null;
  if (error || !res?.ok) {
    return { error: SHOP_ERRORS[res?.reason ?? ""] ?? "Transfert impossible." };
  }

  revalidatePath(`/admin/cafes/${id}`);
  revalidatePath("/owner");
  return { ok: `Transféré à ${res.to}.` };
}

/**
 * Delete a shop.
 *
 * Redirects to the roster on success, because the page the operator is standing
 * on has just ceased to exist — leaving them on it would render a 404 that
 * looks like the delete failed. redirect() throws a control-flow exception, so
 * it must come after everything that matters.
 */
export async function deleteShopAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await requireElevatedSuperAdmin();
  } catch (e) {
    return { error: guardMessage(e) };
  }

  const id = String(formData.get("businessId") ?? "");
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (!id) return { error: "Café introuvable." };

  const { data, error } = await adminWrite<{ ok?: boolean; reason?: string }>(
    "admin_delete_shop",
    { p_id: id, p_confirm: confirm },
  );
  const res = data as { ok?: boolean; reason?: string } | null;
  if (error || !res?.ok) {
    return { error: SHOP_ERRORS[res?.reason ?? ""] ?? "Suppression impossible." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/cafes");
  redirect("/admin/cafes");
}

/** Set the loyalty programme — the four numbers behind "why only 3 points?". */
export async function setProgramAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await requireElevatedSuperAdmin();
  } catch (e) {
    return { error: guardMessage(e) };
  }

  const id = String(formData.get("businessId") ?? "");
  if (!id) return { error: "Café introuvable." };

  const { data, error } = await adminWrite<{ ok?: boolean; reason?: string }>(
    "admin_set_program",
    {
      p_id: id,
      /* No rate: 0031 pinned it to 1 dinar = 1 point with a CHECK constraint,
         platform-wide. See admin_set_program. */
      p_welcome: Number(formData.get("welcome") ?? 0),
      p_expiry_hours: Number(formData.get("expiry") ?? 48),
      p_stamps: formData.get("stamps") === "on",
      p_stamps_req: Number(formData.get("stampsRequired") ?? 8),
      p_stamp_reward: String(formData.get("stampReward") ?? ""),
    },
  );
  const res = data as { ok?: boolean; reason?: string } | null;
  if (error || !res?.ok) {
    return {
      error:
        {
          bad_welcome: "Bienvenue : entre 0 et 10 000 points.",
          bad_expiry: "Expiration : entre 1 h et 1 an.",
          bad_stamps: "Tampons : entre 2 et 50.",
        }[res?.reason ?? ""] ?? "Enregistrement impossible.",
    };
  }

  revalidatePath(`/admin/cafes/${id}`);
  revalidatePath("/owner");
  return { ok: "Programme enregistré." };
}

/* -------------------------------------------------------------------------- */
/* The customer                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Move a customer's balance at one shop.
 *
 * The person is named by their opaque public id, never by phone: the number is
 * resolved inside Postgres (see admin_adjust_points), so a support action does
 * not put a customer's phone number into a form post.
 */
export async function adjustPointsAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await requireElevatedSuperAdmin();
  } catch (e) {
    return { error: guardMessage(e) };
  }

  const publicId = String(formData.get("publicId") ?? "");
  const businessId = String(formData.get("businessId") ?? "");
  const delta = Number(formData.get("delta") ?? 0);
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);

  if (!publicId || !businessId) return { error: "Client introuvable." };
  if (!Number.isFinite(delta) || delta === 0) return { error: "Indiquez un nombre de points." };

  const { data, error } = await adminWrite<{ ok?: boolean; reason?: string; balance?: number }>(
    "admin_adjust_points",
    { p_business_id: businessId, p_public_id: publicId, p_delta: delta, p_note: note || null },
  );
  const res = data as { ok?: boolean; reason?: string; balance?: number } | null;
  if (error || !res?.ok) {
    return {
      error:
        {
          introuvable: "Client introuvable.",
          no_card: "Ce client n'a pas de carte dans ce café.",
          too_big: "Correction trop grande (max 100 000).",
          zero: "Indiquez un nombre de points.",
        }[res?.reason ?? ""] ?? "Correction impossible.",
    };
  }

  revalidatePath(`/admin/clients/${publicId}`);
  revalidatePath(`/admin/cafes/${businessId}`);
  return {
    ok: `${delta > 0 ? "+" : ""}${delta} — nouveau solde : ${res.balance ?? "?"} points.`,
  };
}

/**
 * Give a customer a new secret code.
 *
 * The PIN is MINTED HERE and shown back exactly once. The alternative — letting
 * the operator choose it — produces "1234" on every reset, and this code is the
 * only thing standing between a phone number and somebody's cards on a device
 * they have never used.
 *
 * Hashing is scrypt with a per-account salt (lib/auth/crypto). Postgres receives
 * the hash and never the digits.
 */
export async function resetDinerPinAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await requireElevatedSuperAdmin();
  } catch (e) {
    return { error: guardMessage(e) };
  }

  const publicId = String(formData.get("publicId") ?? "");
  if (!publicId) return { error: "Client introuvable." };

  const { randomInt } = await import("node:crypto");
  const { hashPin } = await import("@/lib/auth/crypto");
  /* randomInt, not Math.random: this is a credential. */
  const pin = String(randomInt(0, 10000)).padStart(4, "0");

  const { data, error } = await adminWrite<{ ok?: boolean; reason?: string }>("admin_reset_pin", {
    p_public_id: publicId,
    p_pin_hash: await hashPin(pin),
  });
  const res = data as { ok?: boolean; reason?: string } | null;
  if (error || !res?.ok) {
    return { error: res?.reason === "introuvable" ? "Client introuvable." : "Réinitialisation impossible." };
  }

  revalidatePath(`/admin/clients/${publicId}`);
  /* The digits are in the success line and nowhere else — not in the database,
     not in the audit log, and not on the page after a reload. */
  return { ok: `Nouveau code : ${pin} — dictez-le maintenant, il ne sera plus affiché.` };
}

/* -------------------------------------------------------------------------- */
/* Many shops at once                                                          */
/* -------------------------------------------------------------------------- */

/** The ids arrive as repeated `ids` fields — one per checked row. */
function selected(formData: FormData): string[] {
  return formData.getAll("ids").map(String).filter(Boolean);
}

export async function bulkPlanAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await requireElevatedSuperAdmin();
  } catch (e) {
    return { error: guardMessage(e) };
  }

  const ids = selected(formData);
  const amount = Number(formData.get("amount") ?? 0);
  const unit = String(formData.get("unit") ?? "months");
  const plan = String(formData.get("plan") ?? "pro");

  if (ids.length === 0) return { error: "Aucun café sélectionné." };
  if (!["trial", "free", "pro"].includes(plan)) return { error: "Formule invalide." };
  if (!["hours", "days", "months"].includes(unit)) return { error: "Unité invalide." };
  if (!Number.isInteger(amount) || amount < 0 || amount > 1000) return { error: "Durée : 0 à 1000." };

  const { data, error } = await adminWrite<{ ok?: boolean; done?: number; failed?: number }>(
    "admin_bulk_plan",
    { p_ids: ids, p_plan: plan, p_amount: amount, p_unit: unit },
  );
  const res = data as { ok?: boolean; done?: number; failed?: number } | null;
  if (error || !res?.ok) return { error: "Action groupée impossible." };

  revalidatePath("/admin");
  revalidatePath("/admin/cafes");
  /* The failures are reported, not swallowed. A bulk action that says "done"
     while three of twelve silently did nothing is worse than one that fails. */
  return {
    ok: `${res.done} café(s) prolongé(s)${res.failed ? ` · ${res.failed} en échec` : ""}.`,
  };
}

export async function bulkNoticeAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await requireElevatedSuperAdmin();
  } catch (e) {
    return { error: guardMessage(e) };
  }

  const ids = selected(formData);
  const kind = String(formData.get("kind") ?? "info");
  const message = String(formData.get("message") ?? "").trim().slice(0, 500);
  const days = Number(formData.get("days") ?? 14);

  if (ids.length === 0) return { error: "Aucun café sélectionné." };
  if (!message) return { error: "Message vide." };
  if (!["info", "warning", "urgent"].includes(kind)) return { error: "Type invalide." };

  const { data, error } = await adminWrite<{ ok?: boolean; done?: number }>("admin_bulk_notice", {
    p_ids: ids,
    p_kind: kind,
    p_message: message,
    p_days: Number.isInteger(days) ? days : 14,
  });
  const res = data as { ok?: boolean; done?: number } | null;
  if (error || !res?.ok) return { error: "Envoi groupé impossible." };

  revalidatePath("/admin");
  revalidatePath("/owner");
  return { ok: `Message envoyé à ${res.done} café(s).` };
}

/* -------------------------------------------------------------------------- */
/* The platform's own settings                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Save the prices and the payment coordinates.
 *
 * The two lists arrive as JSON from a small editor rather than as a hundred
 * flat form fields, because both are variable-length and nested. They are
 * parsed and validated by lib/settings before anything is written — see there
 * for why that validation is not a check constraint.
 */
export async function saveSettingsAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await requireElevatedSuperAdmin();
  } catch (e) {
    return { error: guardMessage(e) };
  }

  const { parseOffers, parseMethods } = await import("@/lib/settings");

  let rawOffers: unknown;
  let rawMethods: unknown;
  try {
    rawOffers = JSON.parse(String(formData.get("offers") ?? "[]"));
    rawMethods = JSON.parse(String(formData.get("methods") ?? "[]"));
  } catch {
    return { error: "Données illisibles — rechargez la page." };
  }

  const offers = parseOffers(rawOffers);
  if (!offers.ok) return { error: offers.error };
  const methods = parseMethods(rawMethods);
  if (!methods.ok) return { error: methods.error };

  const live = formData.get("live") === "on";

  const { data, error } = await adminWrite<{ ok?: boolean; reason?: string }>(
    "admin_save_settings",
    {
      p_live: live,
      p_offers: offers.offers,
      p_methods: methods.methods,
      p_phone: String(formData.get("supportPhone") ?? "").trim() || null,
      p_email: String(formData.get("supportEmail") ?? "").trim() || null,
    },
  );
  const res = data as { ok?: boolean; reason?: string } | null;
  if (error || !res?.ok) {
    return {
      error:
        res?.reason === "no_methods"
          ? "Impossible de passer en direct sans moyen de paiement."
          : "Enregistrement impossible.",
    };
  }

  /* Everything that prints a price or a payment coordinate. */
  revalidatePath("/admin/reglages");
  revalidatePath("/owner/renouveler");
  revalidatePath("/owner/reglages");
  revalidatePath("/");
  return {
    ok: live ? "Enregistré — les paiements sont en direct." : "Enregistré (mode test).",
  };
}

/* -------------------------------------------------------------------------- */
/* The early-access list                                                       */
/* -------------------------------------------------------------------------- */

const EARLY_STATUS = ["new", "contacted", "demo", "client", "lost"];

/**
 * Move a lead along the pipeline, and/or leave a note on it.
 *
 * ONE FORM DOES BOTH, which is why the note is not wiped when it is absent: the
 * status buttons post the whole row's form, note field included, and the "save
 * the note" button posts the status the row already has. An empty note field
 * means "I did not touch the note" far more often than it means "delete the
 * note", so admin_set_early_status coalesces it. Clearing a note is not
 * offered — nobody has needed it, and losing one by pressing Contacté would be
 * the more common accident by a distance.
 */
export async function setEarlyStatusAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await requireElevatedSuperAdmin();
  } catch (e) {
    return { error: guardMessage(e) };
  }

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);

  if (!id) return { error: "Demande introuvable." };
  if (!EARLY_STATUS.includes(status)) return { error: "Statut invalide." };

  const { data, error } = await adminWrite<{ ok?: boolean; reason?: string }>(
    "admin_set_early_status",
    { p_id: id, p_status: status, p_note: note || null },
  );
  const res = data as { ok?: boolean; reason?: string } | null;
  if (error || !res?.ok) {
    return { error: res?.reason === "introuvable" ? "Demande introuvable." : "Action impossible." };
  }

  revalidatePath("/admin");
  return { ok: "Enregistré." };
}

/**
 * Delete a lead. The junk door — see the header of migration 0039 for why a
 * public form with no rate limit in front of it needs one, and why marking it
 * 'lost' instead would be wrong: the counts on this panel are the point, and a
 * test submission left in them quietly makes the conversion rate a lie.
 */
export async function deleteEarlyAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await requireElevatedSuperAdmin();
  } catch (e) {
    return { error: guardMessage(e) };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Demande introuvable." };

  const { error } = await adminWrite("admin_delete_early", { p_id: id });
  if (error) return { error: "Suppression impossible." };

  revalidatePath("/admin");
  return { ok: "Supprimé." };
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
  // /owner/login is that door, so it is also the way back out. Not "/": the
  // session is already gone, and a diner cookie there would take over.
  redirect("/owner/login");
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

/**
 * Approve or refuse a renewal — and, on approve, extend the plan in the same
 * transaction (admin_decide_renewal does both).
 *
 * The duration is NOT in this form. It comes off the request row, which was
 * written from the price list the owner was shown. An operator who could type
 * a number here would eventually type the wrong one, and the shop would be paid
 * up for six months against a twelve-month transfer with nothing to compare.
 */
export async function decideRenewalAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  /* The gate is inside adminWrite now — this one stays to TRANSLATE it: a
     server action that lets UNAUTHORISED escape shows the operator a red
     error boundary instead of "reconnectez-vous". */
  try {
    await requireElevatedSuperAdmin();
  } catch (e) {
    return { error: guardMessage(e) };
  }

  const id = String(formData.get("id") ?? "");
  const approve = formData.get("approve") === "1";
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);
  if (!id) return { error: "Demande introuvable." };
  // Refusing is the one that reaches a person as bad news — never namelessly.
  if (!approve && !note) return { error: "Dites pourquoi : le café verra cette raison." };

  const { data, error } = await adminWrite<PostState>("admin_decide_renewal", {
    p_id: id,
    p_approve: approve,
    p_note: note || null,
  });
  const res = data as { ok?: boolean; reason?: string; plan?: PostState } | null;
  if (error || !res?.ok) {
    if (res?.reason === "already_decided") return { error: "Déjà traitée." };
    return { error: "Impossible de traiter la demande." };
  }

  revalidatePath("/admin");
  revalidatePath("/owner");
  revalidatePath("/owner/renouveler");
  revalidatePath("/owner/reglages");
  return {
    ok: approve && res.plan ? verdict(res.plan, "Renouvellement validé") : "Demande refusée.",
  };
}
