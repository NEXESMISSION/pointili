"use server";

import { revalidatePath } from "next/cache";
import { currentDiner } from "@/lib/auth/diner";
import { getCafe, getLoyaltyProgram } from "@/lib/data";
import { getBalance, getCodes, redeemAtCounter, spinWheel } from "@/lib/db";
import { codeQr } from "@/lib/qr";

export type RedeemState = {
  error?: string;
  /* No expiryHours any more: a code does not expire (0031), so there is no
     deadline to carry to the screen that spends the points. */
  /* `qr` is the code's picture, drawn HERE rather than in the browser: the
     screen that reveals a code is a client component, and shipping a QR
     encoder to every phone to draw six characters it was already given by the
     server is a bundle for nothing. */
  ok?: { code: string; label: string; balance: number; qr: string };
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

  /*
    ── THE CODES THEY ALREADY HOLD, READ BEFORE THE DEBIT ──────────────────

    This costs one read on a path that spends points, and it buys the only
    thing that can tell the two failures apart afterwards. See the catch.
  */
  let held: Set<string> | null = null;
  try {
    held = new Set((await getCodes(cafe.id, phone)).map((c) => c.code));
  } catch {
    /* Not fatal on its own — it only means the rescue below cannot be sure,
       and says so instead of guessing. */
    held = null;
  }

  let res;
  try {
    res = await redeemAtCounter(cafe.id, phone, rewardId);
  } catch {
    /*
      ── THE POINTS MAY ALREADY BE GONE ─────────────────────────────────────

      redeem_at_counter is one plpgsql transaction: the debit and the code are
      written together or not at all, so the database is never left owing
      anybody a code. What CAN happen is that it commits and the answer never
      gets back to us — a dropped connection, a timeout, a 5xx after the
      commit. The client throws either way, and this used to answer every one
      of them with "Échange impossible pour le moment."

      That sentence was a lie in the worst direction: the points were spent,
      the code existed, and the customer was told nothing had happened. It is
      also the likeliest failure this app has — the function talks to a
      database on another continent (see vercel.json).

      So: look. A code this diner did not hold a moment ago is one this call
      created, and it is theirs. Codes stack, so a diner can legitimately hold
      two for the same reward — which is why this compares the actual code
      strings rather than counting them.
    */
    const rescued = held ? await rescueLostCode(cafe.id, phone, held) : null;
    if (rescued) {
      revalidatePath(`/${slug}`);
      revalidatePath(`/${slug}/boutique`);
      return { ok: rescued };
    }
    /* Genuinely unknown, or nothing was written. Never say "it failed" without
       telling them where to check — Mes codes is the durable list, and it is
       the answer whichever way this went. */
    return {
      error: held
        ? "Échange impossible pour le moment."
        : "Réessaie — et vérifie Mes codes avant, au cas où il serait déjà là.",
    };
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
      qr: await safeQr(res.code),
    },
  };
}

/**
 * Draw the code's picture, and never lose the code over it.
 *
 * The QR is a convenience — the screen prints the six characters underneath it
 * and says "ou dicte le code", because a scratched lens or a flat battery is a
 * normal evening at a counter. So an encoder that throws must cost the picture,
 * not the thing the customer just paid for: this returns "" and the reveal
 * still happens. Before, it threw out of the action AFTER the debit, which is
 * the same "points gone, no code" the catch above exists for.
 */
async function safeQr(code: string): Promise<string> {
  try {
    return await codeQr(code);
  } catch {
    return "";
  }
}

/**
 * A code that appeared while we were not looking.
 *
 * Called only when the redeem call threw. Anything the diner is holding now
 * that they were not holding before the attempt was written by that attempt.
 * Returns null when nothing new is there — which means the transaction really
 * did not commit, and the caller is right to report a failure.
 */
async function rescueLostCode(
  businessId: string,
  phone: string,
  held: Set<string>,
): Promise<{ code: string; label: string; balance: number; qr: string } | null> {
  try {
    const now = await getCodes(businessId, phone);
    const fresh = now.find((c) => !held.has(c.code));
    if (!fresh) return null;
    return {
      code: fresh.code,
      label: fresh.label,
      /* The balance is already debited; read it rather than compute it, so the
         number on the screen is the one the ledger agrees with. */
      balance: await getBalance(businessId, phone).catch(() => 0),
      qr: await safeQr(fresh.code),
    };
  } catch {
    return null;
  }
}

export type SpinState = {
  error?: string;
  ok?: {
    code: string;
    label: string;
    prizeId: string;
    balance: number;
    cost: number;
    /** The won code's picture — same reasoning as RedeemState.qr. */
    qr: string;
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

  /* Same reason as redeemAction: a spin spends points, so what it holds now has
     to be knowable if the answer goes missing. */
  let held: Set<string> | null = null;
  try {
    held = new Set((await getCodes(cafe.id, phone)).map((c) => c.code));
  } catch {
    held = null;
  }

  let res;
  try {
    res = await spinWheel(cafe.id, phone);
  } catch {
    /*
      A spin that commits ALWAYS writes a code — spin_wheel inserts into wins on
      every winning path, there is no branch that debits and writes nothing — so
      a code the diner was not holding before means the play went through and
      only the answer was lost.

      This does not return ok: SpinState.ok drives the wheel ANIMATION and needs
      the prize id and the cost, and neither survives the failure. Inventing a
      segment to spin to would be a worse lie than the one being fixed. So the
      customer is told the true thing instead, and where the code is — which is
      what they actually need. The wheel is a nicety; the code is the prize.
    */
    if (held) {
      try {
        const now = await getCodes(cafe.id, phone);
        if (now.some((c) => !held.has(c.code))) {
          revalidatePath(`/${slug}`);
          revalidatePath(`/${slug}/boutique`);
          return { error: "Ta partie est bien passée — ton code t'attend dans Mes codes." };
        }
      } catch {
        /* fall through to the generic message */
      }
    }
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
      qr: await safeQr(res.code),
    },
  };
}
