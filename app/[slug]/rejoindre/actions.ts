"use server";

import { redirect } from "next/navigation";
import {
  hashPin,
  isValidPhone,
  NO_SUCH_ACCOUNT_HASH,
  isValidPin,
  normalisePhone,
  verifyPin,
} from "@/lib/auth/crypto";
import { forgetDevice, lastDinerPhone, startDinerSession } from "@/lib/auth/diner";
import { getCafe, getLoyaltyProgram } from "@/lib/data";
import {
  createAccount,
  creditPoints,
  enrollDiner,
  getAccount,
  pinClear,
  pinFail,
  pinLockedFor,
} from "@/lib/db";

export type JoinState = { error?: string };

/**
 * Onboarding + login in one step (§04): scan → phone → 4-digit PIN → done.
 *
 * If the phone is known we verify the PIN (login). If it isn't, we create the
 * account (signup) and the welcome bonus lands immediately — "instant first
 * value" (§11 #1). The diner never picks a mode; it just works.
 */
export async function joinAction(
  slug: string,
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const pin = String(formData.get("pin") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 40) || null;

  /*
    "return" is the one-field path: the device remembers whose it is, so the
    screen asked for the secret code and nothing else.

    The number comes from the COOKIE, not from the form — it is never printed
    into the page. Somebody holding an unlocked phone could read it off the
    card anyway, but there is no reason to hand it to a script, and a hidden
    field would be one more thing to validate.
  */
  const remembered = String(formData.get("mode") ?? "") === "return"
    ? await lastDinerPhone()
    : null;

  const phone = remembered ?? normalisePhone(String(formData.get("phone") ?? ""));
  if (!isValidPhone(phone)) return { error: "Numéro de téléphone invalide." };
  if (!isValidPin(pin)) return { error: "Le code secret doit contenir 4 chiffres." };

  const cafe = await getCafe(slug);
  if (!cafe) return { error: "Café introuvable." };

  // Throttle before touching the PIN — this is the brute-force gate.
  const lockedFor = await pinLockedFor(phone);
  if (lockedFor > 0) {
    return { error: `Trop d'essais. Réessaie dans ${lockedFor} min.` };
  }

  // Which tab did they submit? "login" means they told us they already have a
  // card, so an unknown phone is a TYPO — never a silent new signup. "return"
  // is the same promise, made by the device rather than typed.
  const mode = String(formData.get("mode") ?? "") === "return"
    ? "login"
    : String(formData.get("mode") ?? "");

  let existing = await getAccount(phone);

  /*
    Burn the scrypt whichever branch we take. Below, an unknown phone on the
    login tab returns without ever deriving a key, so "no such number" comes back
    one whole scrypt sooner than "wrong PIN" — identical wording, different
    timing, still an oracle for "is this person a Pointili customer?".
  */
  const pinOk = await verifyPin(pin, existing?.pin_hash ?? NO_SUCH_ACCOUNT_HASH);

  /** Wrong PIN / unknown-on-the-login-tab — deliberately the same vague wording
   *  so this never becomes a "is this number registered?" oracle. */
  async function wrongCredentials(): Promise<JoinState> {
    await pinFail(phone);
    // If THIS attempt is the one that tripped the lock, say so now — otherwise
    // the diner only learns they're locked on the next submit and keeps trying.
    const lockedNow = await pinLockedFor(phone);
    if (lockedNow > 0) return { error: `Trop d'essais. Réessaie dans ${lockedNow} min.` };
    return { error: "Numéro ou code secret incorrect." };
  }

  if (!existing) {
    if (mode === "login") return wrongCredentials();

    /*
      Check-then-act race: two submits of the same new phone both see "no
      account". The unique primary key makes the loser fail, and dropping them on
      an error screen would be wrong — they ARE this person. Re-read and fall
      through to the normal PIN check instead.
    */
    const created = await createAccount(phone, await hashPin(pin), name);
    if (!created.ok) {
      existing = await getAccount(phone);
      if (!existing) return { error: "Réessaie dans un instant." };
    }
  }

  if (existing) {
    // Re-derive only if the account was just CREATED above (pinOk was computed
    // against the dummy in that case, so it is meaningless).
    const good = pinOk || (await verifyPin(pin, existing.pin_hash));
    if (!good) return wrongCredentials();
    await pinClear(phone);
  }

  /*
    Grant THIS café's welcome bonus — every time someone joins, whether the
    account is new or not.

    The account is global but points are per café, and the welcome bonus is
    per (café, phone). So a diner who already has a card at café A and now scans
    café B's QR should get B's welcome bonus and a fresh card at B. credit_points
    is idempotent per café (it only grants a 'welcome' row once), so re-joining a
    café you already belong to does nothing. This is also what puts the café in
    the diner's wallet — without it, joining a second café left no trace.
  */
  // Enrollment MUST succeed before we send them to the card: /[slug] bounces
  // non-members back here, so a silent failure would be an endless
  // /[slug] ↔ /rejoindre loop with no way out.
  const code = await enrollDiner(cafe.id, phone);
  if (!code) return { error: "Impossible d'activer ta carte. Réessaie." };

  const program = await getLoyaltyProgram(cafe.id);
  if (program.active && program.welcomePoints > 0) {
    await creditPoints(cafe.id, phone, 0); // no purchase — welcome only
  }

  await startDinerSession(phone);
  /* ?nouveau is what tells the card screen to play the arrival once. The card
     page strips it immediately, so it never survives a refresh or a share. */
  redirect(`/${slug}?nouveau=1`);
}

/**
 * "Ce n'est pas moi" — forget which number this device belongs to.
 *
 * The ONLY thing that clears the hint. Signing out does not: you sign out to
 * hand your phone to a friend for a minute, and being greeted by name when you
 * come back is right. This is the person saying the greeting is wrong.
 */
export async function forgetDeviceAction() {
  await forgetDevice();
}
