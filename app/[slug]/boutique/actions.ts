"use server";

import { revalidatePath } from "next/cache";
import { currentDiner } from "@/lib/auth/diner";
import { getCafe, getLoyaltyProgram } from "@/lib/data";
import { redeemAtCounter } from "@/lib/db";

export type RedeemState = {
  error?: string;
  /** expiryHours: the code is on a clock, and the screen that spends the points
   *  is the only place the diner is guaranteed to look. */
  ok?: { code: string; label: string; balance: number; expiryHours: number };
};

/**
 * The Reward (§10 · moment 3) — SERVER-AUTHORITATIVE.
 *
 * The browser sends a reward id and nothing else. Identity comes from the signed
 * session; the cost is read from the owner's catalogue inside the RPC, never
 * from the client; the balance check and the debit are one atomic step behind an
 * advisory lock, so a double-tap can't spend the same points twice.
 */
export async function redeemAction(
  slug: string,
  _prev: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const rewardId = String(formData.get("rewardId") ?? "");
  if (!rewardId) return { error: "Récompense invalide." };

  const phone = await currentDiner();
  if (!phone) return { error: "Connecte-toi pour échanger." };

  const cafe = await getCafe(slug);
  if (!cafe) return { error: "Café introuvable." };

  /*
    Every other value path checks this; redeeming didn't, so points could still
    be spent at a shop whose owner had paused the programme (the caisse refuses
    to credit, but the boutique kept selling).
  */
  const program = await getLoyaltyProgram(cafe.id);
  if (!program.active) return { error: "Programme de fidélité en pause." };

  let res;
  try {
    res = await redeemAtCounter(cafe.id, phone, rewardId);
  } catch {
    return { error: "Échange impossible pour le moment." };
  }

  if (!res.ok) {
    if (res.reason === "insufficient") {
      return { error: `Il te manque ${res.needed} points.` };
    }
    return { error: "Récompense indisponible." };
  }

  revalidatePath(`/${slug}`);
  revalidatePath(`/${slug}/boutique`);
  return {
    ok: {
      code: res.code,
      label: res.label,
      balance: res.balance,
      expiryHours: program.redeemExpiryHours,
    },
  };
}
