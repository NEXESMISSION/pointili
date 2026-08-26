"use server";

import { redirect } from "next/navigation";
import { currentDiner, startDinerSession } from "@/lib/auth/diner";
import {
  hashPin,
  isValidPhone,
  isValidPin,
  normalisePhone,
  NO_SUCH_ACCOUNT_HASH,
  verifyPin,
} from "@/lib/auth/crypto";
import { createAccount, getAccount, pinClear, pinGate } from "@/lib/db";

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

export type SignUpState = { error?: string; phone?: string; name?: string };

/**
 * AN ACCOUNT WITHOUT A SHOP IN HAND.
 *
 * Signing up used to require standing in a café: the only form was at
 * /[slug]/rejoindre, which you cannot reach without a shop's slug, which you
 * get by scanning a QR taped to its counter. Somebody who hears about Pointili
 * anywhere else had no way in at all.
 *
 * ── THE OBJECTION THIS ANSWERS ────────────────────────────────────────────
 *
 * The reason it was refused is written next to signInAction and it was a real
 * one: "the welcome bonus and the card itself are per-café, so an account
 * created here would land in an empty wallet with nothing to show".
 *
 * That was true of the WALLET, not of the account. The 4-character code is
 * platform-wide (0019) and the till resolves it at any shop on the platform —
 * including one this person has never visited, which is the whole walk-in path.
 * So an account with no cards is not a dead end; it is somebody who can walk
 * into any Pointili counter tomorrow, show four characters, and have points
 * from their first purchase. The empty wallet says exactly that now.
 *
 * What does NOT happen here is a welcome bonus or an enrolment. Those belong to
 * a shop, and no shop is involved yet.
 *
 * ── A NUMBER THAT IS ALREADY TAKEN ────────────────────────────────────────
 *
 * It is not announced. Somebody signing up on a number that already has an
 * account is overwhelmingly the owner of that number, returning — so the PIN
 * they typed is checked against it, and a correct one simply signs them in.
 * A wrong one gets the same vague sentence as everywhere else in this product,
 * because "that number is registered" is an oracle for whether a given Tunisian
 * mobile belongs to a Pointili customer, and eight digits is not a search space.
 */
export async function signUpAction(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const rawPhone = String(formData.get("phone") ?? "");
  const pin = String(formData.get("pin") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().slice(0, 40) || null;
  const phone = normalisePhone(rawPhone);
  const keep = { phone: rawPhone, name: name ?? undefined };

  if (!isValidPhone(phone)) return { ...keep, error: "Numéro de téléphone invalide." };
  if (!isValidPin(pin)) return { ...keep, error: "Le code secret doit contenir 4 chiffres." };

  /*
    The same gate as every other PIN path, and BEFORE anything is created:
    without it this form is an unthrottled way to mint rows, and a throttle that
    ran after the write would not be one. pin_gate counts as it checks (0038).
  */
  const lockedFor = await pinGate(phone);
  if (lockedFor > 0) return { ...keep, error: `Trop d'essais. Réessaie dans ${lockedFor} min.` };

  let account = await getAccount(phone);
  /* Burn the scrypt on both branches — see signInAction for why the timing of
     "no such number" matters as much as its wording. */
  const pinOk = await verifyPin(pin, account?.pin_hash ?? NO_SUCH_ACCOUNT_HASH);

  if (!account) {
    /*
      Check-then-act race: two submits of the same new number both see "no
      account". The primary key makes the loser fail, and they ARE this person —
      so re-read and fall through to the ordinary PIN check.
    */
    const created = await createAccount(phone, await hashPin(pin), name);
    if (!created.ok) {
      account = await getAccount(phone);
      if (!account) return { ...keep, error: "Réessaie dans un instant." };
    } else {
      await pinClear(phone);
      await startDinerSession(phone);
      redirect("/cartes");
    }
  }

  const good = pinOk || (await verifyPin(pin, account!.pin_hash));
  if (!good) return { ...keep, error: "Numéro ou code secret incorrect." };

  await pinClear(phone);
  await startDinerSession(phone);
  redirect("/cartes");
}

/** Already signed in? Then this page has nothing to ask. */
export async function alreadyIn(): Promise<boolean> {
  return Boolean(await currentDiner());
}
