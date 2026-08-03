"use server";

import { revalidatePath } from "next/cache";
import { currentDiner } from "@/lib/auth/diner";
import { getCafe, getLoyaltyProgram } from "@/lib/data";
import { redeemAtCounter, spinWheel } from "@/lib/db";

export type RedeemState = {
  error?: string;
  /* No expiryHours any more: a code does not expire (0031), so there is no
     deadline to carry to the screen that spends the points. */
  ok?: { code: string; label: string; balance: number };
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
    },
  };
}

export type SpinState = {
  error?: string;
  ok?: {
    code: string;
    label: string;
    prizeId: string;
    balance: number;
    cost: number;
  };
};

/**
 * The Spin — the same contract as redeemAction, and deliberately so.
 *
 * The browser sends NOTHING but the intention to spin. Not the price, not the
 * prize, not the odds. spin_wheel reads the price off the games row, draws the
 * segment in Postgres, and debits under the same advisory lock a redeem uses,
 * so spinning and redeeming cannot spend the same points twice.
 *
 * A client that chose its own prize would be a client that always won the best
 * one, so the wheel on screen is only ever an ANIMATION OF A RESULT THAT HAS
 * ALREADY HAPPENED — it spins to where the server landed.
 */
export async function spinAction(
  slug: string,
  _prev: SpinState,
  _formData: FormData,
): Promise<SpinState> {
  const phone = await currentDiner();
  if (!phone) return { error: "Connecte-toi pour jouer." };

  const cafe = await getCafe(slug);
  if (!cafe) return { error: "Café introuvable." };

  const program = await getLoyaltyProgram(cafe.id);
  if (!program.active) return { error: "Programme de fidélité en pause." };

  let res;
  try {
    res = await spinWheel(cafe.id, phone);
  } catch {
    return { error: "Impossible de jouer pour le moment." };
  }

  if (!res.ok) {
    if (res.reason === "insufficient") {
      return { error: `Il te manque ${res.needed} points pour tourner.` };
    }
    return { error: "La roue n'est pas disponible." };
  }

  revalidatePath(`/${slug}`);
  revalidatePath(`/${slug}/boutique`);
  return {
    ok: {
      code: res.code,
      label: res.prizeLabel,
      prizeId: res.prizeId,
      balance: res.balance,
      cost: res.cost,
    },
  };
}
