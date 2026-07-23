"use server";

import { revalidatePath } from "next/cache";
import { isValidPhone, normalisePhone } from "@/lib/auth/crypto";
import { ownerCafe } from "@/lib/auth/owner";
import { getLoyaltyProgram } from "@/lib/data";
import { claimCode, creditPoints, peekCode } from "@/lib/db";

export type CreditState = {
  error?: string;
  ok?: {
    phone: string;
    earned: number;
    welcome: number;
    balance: number;
    multiplier: number;
  };
};

export type PeekState = {
  error?: string;
  peek?: {
    code: string;
    label: string;
    kind: "win" | "reward";
    status: "valid" | "expired" | "claimed";
  };
};

export type CollectState = {
  error?: string;
  ok?: { label: string; code: string };
};

/**
 * Consume → Earn (§10 · moment 1). Staff credits a phone for a purchase.
 *
 * Server-authoritative: the till sends an amount in dinars; the POINTS are
 * computed inside credit_points() from the owner's own points_per_tnd and any
 * active event multiplier. The client never sends a points figure.
 */
export async function creditAction(
  _prev: CreditState,
  formData: FormData,
): Promise<CreditState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  const phone = normalisePhone(String(formData.get("phone") ?? ""));
  const amount = Number(String(formData.get("amount") ?? "").replace(",", "."));

  if (!isValidPhone(phone)) return { error: "Numéro invalide." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Montant invalide." };
  if (amount > 10_000) return { error: "Montant trop élevé." };

  const program = await getLoyaltyProgram(cafe.id);
  if (!program.active) return { error: "Programme de fidélité désactivé." };

  // Points can be credited to a phone that hasn't signed up yet — they wait for
  // the diner (§05: the ledger is keyed by café + phone, not by account).
  const res = await creditPoints(cafe.id, phone, amount);
  if (!res.ok) return { error: res.reason };

  revalidatePath("/owner");
  revalidatePath("/owner/analyses");
  revalidatePath(`/${cafe.slug}`);
  return {
    ok: {
      phone,
      earned: res.earned,
      welcome: res.welcome,
      balance: res.balance,
      multiplier: res.multiplier,
    },
  };
}

/**
 * Step 1 — look up a code WITHOUT serving it.
 *
 * Read-only on purpose: staff can show a diner what a code is (and whether it's
 * still good) without spending it. Nothing is collected until they confirm.
 */
export async function peekAction(
  _prev: PeekState,
  formData: FormData,
): Promise<PeekState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return { error: "Code à 6 caractères." };

  const res = await peekCode(cafe.id, code);
  if (!res.found) return { error: "Code introuvable." };
  return { peek: { code, label: res.label, kind: res.kind, status: res.status } };
}

/**
 * Step 2 — collect. Only now is the code served (claimed exactly once, inside
 * the RPC). Called when staff explicitly hits "Collecter".
 */
export async function collectAction(
  _prev: CollectState,
  formData: FormData,
): Promise<CollectState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return { error: "Code à 6 caractères." };

  const res = await claimCode(cafe.id, code);
  if (!res.ok) return { error: `Code ${res.reason}.` };

  revalidatePath("/owner");
  revalidatePath("/owner/analyses");
  revalidatePath(`/${cafe.slug}`); // the diner's history now shows what they collected
  return { ok: { label: res.label, code } };
}
