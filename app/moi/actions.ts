"use server";

import { redirect } from "next/navigation";
import { currentDiner, startDinerSession } from "@/lib/auth/diner";
import {
  isValidPhone,
  isValidPin,
  normalisePhone,
  NO_SUCH_ACCOUNT_HASH,
  verifyPin,
} from "@/lib/auth/crypto";
import { getAccount, pinClear, pinGate } from "@/lib/db";

export type SignInState = { error?: string; phone?: string };

/**
 * The diner front door — sign in from anywhere, with no shop in hand.
 *
 * This exists because the account is global while every other diner route is
 * scoped to a shop. Before this, a diner who cleared their cookies had no way
 * back to their own points: /cartes bounces a signed-out visitor to the
 * marketing landing, and the only sign-in form lived at /[slug]/rejoindre, which
 * you cannot reach without knowing a shop's slug. Their only option was to walk
 * back into a shop and rescan the QR.
 *
 * It is deliberately LOGIN-ONLY. Signing up needs a shop: the welcome bonus and
 * the card itself are per-café, so an account created here would land in an
 * empty wallet with nothing to show. An unknown number gets the same answer as a
 * wrong PIN.
 */
export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const rawPhone = String(formData.get("phone") ?? "");
  const pin = String(formData.get("pin") ?? "").trim();
  const phone = normalisePhone(rawPhone);

  // Keep what they typed on every failure — retyping a number on a phone
  // keyboard after each mistake is how people give up.
  const keep = { phone: rawPhone };

  if (!isValidPhone(phone)) return { ...keep, error: "Numéro de téléphone invalide." };
  if (!isValidPin(pin)) return { ...keep, error: "Le code secret doit contenir 4 chiffres." };

  // Throttle BEFORE touching the PIN — this is the brute-force gate, and it is
  // keyed by phone, so exposing this form at a fixed URL does not widen it.
  /*
    ONE call, and it COUNTS this attempt as it checks. The old shape read
    pin_locked_for, verified, then called pin_fail — three steps nothing
    serialised, so concurrent guesses all passed the read before any was
    recorded. pin_gate holds an advisory lock on the phone (0038).
  */
  const lockedFor = await pinGate(phone);
  if (lockedFor > 0) return { ...keep, error: `Trop d'essais. Réessaie dans ${lockedFor} min.` };

  const account = await getAccount(phone);

  /*
    One wording for "no such number" and for "wrong PIN", on purpose. Split them
    and this form becomes an oracle for "is this person a Pointili customer?" —
    worse here than at /[slug]/rejoindre, because a global URL lets someone sweep
    a whole range of numbers.

    The scrypt runs either way for the same reason: `!account || await verify(…)`
    would short-circuit and answer an unknown number one whole key derivation
    sooner than a wrong PIN. Identical words with different timing is still an
    oracle.
  */
  const ok = await verifyPin(pin, account?.pin_hash ?? NO_SUCH_ACCOUNT_HASH);
  if (!account || !ok) {
    // Already counted by pinGate above — nothing to record here.
    return { ...keep, error: "Numéro ou code secret incorrect." };
  }

  await pinClear(phone);
  await startDinerSession(phone);
  redirect("/cartes");
}

/** Already signed in? Then this page has nothing to ask. */
export async function alreadyIn(): Promise<boolean> {
  return Boolean(await currentDiner());
}
