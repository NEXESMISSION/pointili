"use server";

import { redirect } from "next/navigation";
import {
  hashPin,
  isValidPhone,
  isValidPin,
  normalisePhone,
  signSession,
  verifyPin,
} from "@/lib/auth/crypto";
import { setDinerSession } from "@/lib/auth/diner";
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
  const rawPhone = String(formData.get("phone") ?? "");
  const pin = String(formData.get("pin") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 40) || null;

  const phone = normalisePhone(rawPhone);
  if (!isValidPhone(phone)) return { error: "Numéro de téléphone invalide." };
  if (!isValidPin(pin)) return { error: "Le code doit contenir 4 chiffres." };

  const cafe = await getCafe(slug);
  if (!cafe) return { error: "Café introuvable." };

  // Throttle before touching the PIN — this is the brute-force gate.
  const lockedFor = await pinLockedFor(phone);
  if (lockedFor > 0) {
    return { error: `Trop d'essais. Réessaie dans ${lockedFor} min.` };
  }

  const existing = await getAccount(phone);

  if (existing) {
    if (!(await verifyPin(pin, existing.pin_hash))) {
      await pinFail(phone);
      // If THIS attempt is the one that tripped the lock, say so now — otherwise
      // the diner only learns they're locked on the next submit and keeps trying.
      const lockedNow = await pinLockedFor(phone);
      if (lockedNow > 0) {
        return { error: `Trop d'essais. Réessaie dans ${lockedNow} min.` };
      }
      // Deliberately vague: never reveal whether the phone is registered.
      return { error: "Numéro ou code incorrect." };
    }
    await pinClear(phone);
  } else {
    await createAccount(phone, await hashPin(pin), name);
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
  await enrollDiner(cafe.id, phone);
  const program = await getLoyaltyProgram(cafe.id);
  if (program.active && program.welcomePoints > 0) {
    await creditPoints(cafe.id, phone, 0); // no purchase — welcome only
  }

  await setDinerSession(signSession(phone));
  redirect(`/${slug}`);
}
