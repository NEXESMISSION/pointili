"use server";

import { revalidatePath } from "next/cache";
import { isValidPhone, normalisePhone } from "@/lib/auth/crypto";
import { ownerCafe } from "@/lib/auth/owner";
import { getLoyaltyProgram } from "@/lib/data";
import {
  addStamp,
  cardByCode,
  claimCode,
  creditPoints,
  getAccount,
  getBalance,
  getCardCode,
  getStamps,
  peekCode,
} from "@/lib/db";

/**
 * A customer is identified at the counter by their short per-shop CODE
 * (preferred — scanned or typed, so the phone never shows) OR, as a fallback,
 * their phone number. Letters ⇒ it's a code; all-digits ⇒ a phone (with a code
 * fallback). The phone we resolve stays server-side — the result shows a NAME
 * (or a masked number), never the raw phone.
 */
type Resolved = { phone: string; name: string | null };

async function resolveCustomer(cafeId: string, raw: string): Promise<Resolved | { error: string }> {
  const cleaned = String(raw ?? "").trim().replace(/[\s-]/g, "");
  if (!cleaned) return { error: "Numéro ou code du client requis." };

  if (/[A-Za-z]/.test(cleaned)) {
    const card = await cardByCode(cafeId, cleaned);
    return card ? { phone: card.phone, name: card.name } : { error: "Client introuvable — vérifiez le code." };
  }
  const phone = normalisePhone(cleaned);
  if (isValidPhone(phone)) {
    const acc = await getAccount(phone);
    return { phone, name: acc?.name ?? null };
  }
  const card = await cardByCode(cafeId, cleaned);
  return card ? { phone: card.phone, name: card.name } : { error: "Numéro ou code invalide." };
}

/** "+216 24 ••• 123" — enough to confirm the right person, never the full number. */
function maskPhone(phone: string): string {
  const d = phone.replace(/[^\d]/g, "");
  if (d.length < 6) return "client";
  return `••• ${d.slice(-3)}`;
}

/** What the cashier sees after an action — a name if we have one, else masked. */
function customerLabel(r: Resolved): string {
  return r.name ?? maskPhone(r.phone);
}

export type CreditState = {
  error?: string;
  ok?: {
    label: string;
    earned: number;
    welcome: number;
    balance: number;
    multiplier: number;
  };
};

export type StampState = {
  error?: string;
  ok?: { who: string; count: number; required: number; completed: boolean; code: string | null; label: string };
};

export type ResolveState = {
  error?: string;
  customer?: { code: string; name: string | null; balance: number; stamps: number };
};

/**
 * Resolve a scanned code (or typed code/phone) to the customer for the scan
 * panel. Returns the short code + name + current balance/stamps — never the phone.
 */
export async function resolveCustomerAction(idOrPhone: string): Promise<ResolveState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  const who = await resolveCustomer(cafe.id, idOrPhone);
  if ("error" in who) return { error: who.error };

  const [code, balance, stamps] = await Promise.all([
    getCardCode(cafe.id, who.phone),
    getBalance(cafe.id, who.phone),
    getStamps(cafe.id, who.phone),
  ]);
  if (!code) return { error: "Ce client n'a pas encore de carte ici." };
  return { customer: { code, name: who.name, balance, stamps } };
}

export type PeekState = {
  error?: string;
  peek?: {
    code: string;
    label: string;
    kind: "win" | "reward" | "stamp";
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

  const amount = Number(String(formData.get("amount") ?? "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Montant invalide." };
  if (amount > 10_000) return { error: "Montant trop élevé." };

  const who = await resolveCustomer(cafe.id, String(formData.get("customer") ?? formData.get("phone") ?? ""));
  if ("error" in who) return { error: who.error };

  const program = await getLoyaltyProgram(cafe.id);
  if (!program.active) return { error: "Programme de fidélité désactivé." };

  const res = await creditPoints(cafe.id, who.phone, amount);
  if (!res.ok) return { error: res.reason };

  revalidatePath("/owner");
  revalidatePath("/owner/analyses");
  revalidatePath(`/${cafe.slug}`);
  return {
    ok: {
      label: customerLabel(who),
      earned: res.earned,
      welcome: res.welcome,
      balance: res.balance,
      multiplier: res.multiplier,
    },
  };
}

/**
 * Manual "+1 tampon". Staff taps this once per visit; when the card fills the
 * RPC issues a counter code the diner then collects like any other reward.
 */
export async function addStampAction(
  _prev: StampState,
  formData: FormData,
): Promise<StampState> {
  const cafe = await ownerCafe();
  if (!cafe) return { error: "Non autorisé." };

  const who = await resolveCustomer(cafe.id, String(formData.get("customer") ?? formData.get("phone") ?? ""));
  if ("error" in who) return { error: who.error };

  const program = await getLoyaltyProgram(cafe.id);
  if (!program.stampsEnabled) return { error: "Carte à tampons désactivée." };

  const res = await addStamp(cafe.id, who.phone, 1);
  if (!res.ok) return { error: res.reason };

  revalidatePath("/owner");
  revalidatePath(`/${cafe.slug}`);
  return {
    ok: {
      who: customerLabel(who),
      count: res.count,
      required: res.required,
      completed: res.completed,
      code: res.code,
      label: res.label,
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
