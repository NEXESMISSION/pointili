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
  getActivity,
  getBalance,
  isCardholder,
  getStamps,
  ownerAdjustPoints,
  ownerSetStamps,
  peekCode,
  pointsPreviewInputs,
  type Activity,
} from "@/lib/db";

/**
 * A customer is identified at the counter by their 4-char ACCOUNT code
 * (preferred — scanned or typed, so the phone never shows) OR, as a fallback,
 * their phone number. Letters ⇒ it's a code; all-digits ⇒ a phone (with a code
 * fallback). The phone we resolve stays server-side — the result shows a NAME
 * (or a masked number), never the raw phone.
 *
 * The code is the same at every shop, so this resolves someone who has never
 * been here before. That is the point: the cashier credits them, the points
 * wait, and nobody is turned away for holding "the wrong shop's" code.
 *
 * A purely numeric code still lands here rather than being read as a phone:
 * normalisePhone("2345") gives "+2162345", too short to be valid, so it falls
 * through to the code lookup. That only holds while the code is exactly four
 * characters.
 */
type Resolved = { phone: string; name: string | null; code: string | null };

async function resolveCustomer(cafeId: string, raw: string): Promise<Resolved | { error: string }> {
  const cleaned = String(raw ?? "").trim().replace(/[\s-]/g, "");
  if (!cleaned) return { error: "Code client ou numéro requis." };

  if (/[A-Za-z]/.test(cleaned)) {
    const card = await cardByCode(cafeId, cleaned);
    if (card) return { phone: card.phone, name: card.name, code: card.code };
    /*
      Six characters means they handed over a REWARD voucher, not their
      identity: account codes are 4 (0019_*.sql), vouchers are 6
      (pointili_gen_code, 0003_rpcs.sql:24-33), and both draw on the same
      alphabet, so the two are indistinguishable to a cashier under pressure.
      Saying "client introuvable" here sent the owner hunting a signup problem
      that does not exist. Name the actual mistake instead.
    */
    if (cleaned.length === 6) {
      return { error: "C'est un code de récompense — passez à « Valider une récompense »." };
    }
    return { error: "Client introuvable — vérifiez le code." };
  }
  const phone = normalisePhone(cleaned);
  if (isValidPhone(phone)) {
    // The walk-in path: no account is not an error, it is someone who has not
    // signed up yet. Never touches a code table.
    const acc = await getAccount(phone);
    return { phone, name: acc?.name ?? null, code: acc?.code ?? null };
  }
  const card = await cardByCode(cafeId, cleaned);
  return card
    ? { phone: card.phone, name: card.name, code: card.code }
    : { error: "Code client ou numéro invalide." };
}

/**
 * A refusal a cashier can act on.
 *
 * The RPCs answer in French already ("café indisponible", "déjà utilisé"). The
 * data layer answers with whatever Postgres said when the CALL failed, and that
 * is the one nobody should ever read across a counter: a connection reset, a
 * schema-cache miss, a statement timeout. Anything that is not one of ours
 * becomes a sentence, and the original is left on the server log where it is
 * useful.
 */
function tillMessage(reason: string | undefined): string {
  const r = String(reason ?? "");
  if (!r) return "Opération impossible. Réessayez.";
  if (r === "insufficient") return "Points insuffisants.";
  if (r === "off" || r === "unavailable") return "Programme indisponible.";
  /* ours are sentences: French, lower case, no underscores, no SQLSTATE */
  const ours = /^[a-zà-ÿ][a-zà-ÿ '’éèêëàâîïôöûüç-]{3,60}$/i.test(r) && !/[_{}();]/.test(r);
  if (ours) return r.charAt(0).toUpperCase() + r.slice(1) + ".";
  console.error("[till] unmapped failure:", r);
  return "Opération impossible. Réessayez.";
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

/**
 * WHO WAS JUST SERVED — the facts a cashier cannot read off a card.
 *
 * The till identifies people by a scan now: it hands the code to the server and
 * the points land. That is fast, and it means the person at the counter never
 * appears on screen until it is over — so the confirmation has to carry enough
 * to tell a right customer from a wrong one, and enough to answer the question
 * every cashier asks out loud ("t'as combien de points ?").
 *
 * `known` and `account` are NOT the same question, and the difference is the
 * whole walk-in feature:
 *   · `known`   — holds a card at THIS shop.
 *   · `account` — has a Pointili identity at all (the 4-char code). Somebody
 *                  can be a member of ten other shops and a stranger here, and
 *                  somebody credited by phone number may be neither yet — the
 *                  points wait for them either way.
 *
 * The phone never travels: a name, or "••• 123".
 */
export type Whom = {
  label: string;
  /** Their 4-character account code, when they have an account at all. */
  account: string | null;
  /** Holds a card at THIS shop — not the same as "has an account". */
  known: boolean;
  /** Their points at this shop, AFTER whatever just happened. */
  balance: number;
};

async function whomIs(businessId: string, r: Resolved, balance: number): Promise<Whom> {
  return {
    label: customerLabel(r),
    account: r.code,
    known: await isCardholder(businessId, r.phone),
    balance,
  };
}

/* ── Managing one card, addressed by its CODE ───────────────────────────
   The till never holds a phone number: every correction and the history are
   looked up from the short per-shop code, resolved server-side. This is what
   let the separate "Clients" page fold into the caisse.                    */

export type ManageResult = { ok: boolean; error?: string; balance?: number; stamps?: number };

export async function adjustByCodeAction(
  code: string,
  delta: number,
  /** Set only by the till's undo — the dinars of the sale being reversed. */
  amountTnd?: number,
): Promise<ManageResult> {
  const cafe = await ownerCafe();
  if (!cafe) return { ok: false, error: "Non autorisé." };
  if (!Number.isFinite(delta) || delta === 0) return { ok: false, error: "Entrez un nombre." };
  if (Math.abs(delta) > 1_000_000) return { ok: false, error: "Trop grand." };

  const who = await resolveCustomer(cafe.id, code);
  if ("error" in who) return { ok: false, error: who.error };

  /*
    Two decimals, NOT Math.round.

    Points went decimal in 0027 and this line did not: undoing a 1,5-point
    credit called Math.round(-1.5) and took back 2, so the one control whose
    entire job is to put a mistake right created a different one — in the exact
    path the decimal change existed to protect. A manual "-1,25" became "-1"
    the same way. The RPC rounds to 2dp as well; this is belt and braces
    against a hand-typed "0,004".
  */
  const res = await ownerAdjustPoints(
    cafe.id,
    who.phone,
    Math.round(delta * 100) / 100,
    amountTnd ?? null,
  );
  if (!res.ok) return { ok: false, error: "Échec." };

  revalidatePath("/owner");
  revalidatePath(`/${cafe.slug}`);
  return { ok: true, balance: res.balance };
}

export async function setStampsByCodeAction(code: string, count: number): Promise<ManageResult> {
  const cafe = await ownerCafe();
  if (!cafe) return { ok: false, error: "Non autorisé." };
  if (!Number.isFinite(count) || count < 0) return { ok: false, error: "Nombre invalide." };

  const who = await resolveCustomer(cafe.id, code);
  if ("error" in who) return { ok: false, error: who.error };

  const res = await ownerSetStamps(cafe.id, who.phone, Math.round(count));
  if (!res.ok) return { ok: false, error: "Échec." };

  revalidatePath("/owner");
  revalidatePath(`/${cafe.slug}`);
  return { ok: true, stamps: res.count };
}

export async function historyByCodeAction(code: string): Promise<Activity[]> {
  const cafe = await ownerCafe();
  if (!cafe) return [];
  const who = await resolveCustomer(cafe.id, code);
  if ("error" in who) return [];
  return getActivity(cafe.id, who.phone, 12);
}

export type CreditState = {
  error?: string;
  ok?: {
    /** Who it landed on, and what they hold — see Whom. */
    who: Whom;
    /** Their balance BEFORE this sale, so the receipt can show the movement. */
    before: number;
    earned: number;
    welcome: number;
    balance: number;
    multiplier: number;
    /** The dinars the cashier keyed — so the receipt can restate them. */
    amount: number;
    /**
     * Rewards this credit JUST put in reach — affordable now, not before.
     *
     * The one thing on the confirmation a cashier can act on. The customer is
     * still standing there; "vous pouvez prendre un espresso maintenant" is the
     * whole product working, and without this nobody would know to say it.
     */
    unlocked: string[];
    /** How far the next one is, once there is nothing to claim yet. */
    next: { label: string; needed: number } | null;
  };
};

export type StampState = {
  error?: string;
  ok?: {
    who: Whom;
    count: number;
    required: number;
    completed: boolean;
    /** The VOUCHER code, minted when this stamp filled the card — not theirs. */
    code: string | null;
    label: string;
  };
};

export type ResolveState = {
  error?: string;
  customer?: {
    /** What every later action is addressed by: the account code once they have
     *  one, otherwise the phone the cashier typed. resolveCustomer takes both. */
    ref: string;
    /** null until they create an account — the till still works. */
    code: string | null;
    /** Holds a card at THIS shop. No longer the same as "has an account": those
     *  diverged the moment the code went account-wide. */
    enrolled: boolean;
    name: string | null;
    balance: number;
    stamps: number;
    /**
     * What the keypad needs so its "→ N points" is the number the receipt will
     * show: an active points event, and the fraction of a point this customer
     * is already owed from previous visits (0026).
     */
    multiplier: number;
    carry: number;
  };
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

  const [enrolled, balance, stamps, preview] = await Promise.all([
    isCardholder(cafe.id, who.phone),
    getBalance(cafe.id, who.phone),
    getStamps(cafe.id, who.phone),
    pointsPreviewInputs(cafe.id, who.phone),
  ]);

  /*
    No card yet is FINE — this is the walk-in case.

    The ledger is keyed by (café, phone), so points credited to someone who has
    never signed up simply wait for them: the day they scan the QR and join,
    the balance is already on their card. Refusing here would have forced the
    cashier to turn a paying customer away at the till.
  */
  return {
    customer: {
      ref: who.code || who.phone,
      code: who.code,
      enrolled,
      name: who.name,
      balance,
      stamps: stamps.count,
      multiplier: preview.multiplier,
      carry: preview.carry,
    },
  };
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
  /*
    NEVER THE DATABASE'S OWN WORDS. lib/db returns `reason: error.message` when
    the call itself fails, so a pooler timeout used to print PostgREST's error
    string onto the till mid-service. The RPC's own refusals are already French
    sentences and pass through; anything else becomes one.
  */
  if (!res.ok) return { error: tillMessage(res.reason) };

  revalidatePath("/owner");
  revalidatePath("/owner/clients");
  revalidatePath(`/${cafe.slug}`);

  /*
    What this credit just changed for the customer, worked out from the balance
    BEFORE it (the new one minus everything this call added). Crossing a reward
    threshold is the moment the loyalty scheme pays off, and it happens while
    the person is still at the counter — so the till has to say it, or the
    cashier never mentions it and the customer finds out days later.
  */
  const { getRewards, nextRewardNudge } = await import("@/lib/data");
  const [rewards, who2] = await Promise.all([
    getRewards(cafe.id),
    whomIs(cafe.id, who, res.balance),
  ]);
  const before = res.balance - res.earned - res.welcome;
  const unlocked = rewards
    .filter((r) => r.pointsCost <= res.balance && r.pointsCost > before)
    .sort((a, b) => b.pointsCost - a.pointsCost)
    .map((r) => r.label);
  const nudge = nextRewardNudge(res.balance, rewards);

  return {
    ok: {
      who: who2,
      before,
      earned: res.earned,
      welcome: res.welcome,
      balance: res.balance,
      multiplier: res.multiplier,
      amount,
      unlocked,
      next: nudge ? { label: nudge.target.label, needed: nudge.needed } : null,
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
  if (!res.ok) return { error: tillMessage(res.reason) };

  revalidatePath("/owner");
  revalidatePath(`/${cafe.slug}`);

  /*
    The POINTS balance on a STAMP receipt is not a mistake.

    A stamp answers "how far along the card am I", and the customer standing
    there asks the other question in the same breath. The till used to make the
    cashier close the receipt, search the person again and open their fiche to
    answer it. One read costs less than that.
  */
  const who2 = await whomIs(cafe.id, who, await getBalance(cafe.id, who.phone));
  return {
    ok: {
      who: who2,
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
  if (!/^[A-Z0-9]{6,8}$/.test(code)) return { error: "Code invalide — 6 à 8 caractères." };

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
  if (!/^[A-Z0-9]{6,8}$/.test(code)) return { error: "Code invalide — 6 à 8 caractères." };

  const res = await claimCode(cafe.id, code);
  if (!res.ok) return { error: `Code ${res.reason}.` };

  revalidatePath("/owner");
  revalidatePath("/owner/clients");
  revalidatePath(`/${cafe.slug}`); // the diner's history now shows what they collected
  return { ok: { label: res.label, code } };
}

/**
 * Reset a customer's secret code, at the counter.
 *
 * THE HOLE THIS CLOSES: `pin_hash` was written in exactly one place — account
 * creation. A customer who forgot their code lost every card at every shop,
 * permanently, and nobody could help: not the shop, not the platform operator.
 * There was no recovery path in the product at all.
 *
 * The counter is the right place for it, and the reason is that the hard part
 * of a password reset is proving who you are — and here that is already solved
 * by standing in front of someone. The cashier sees the customer, resolves them
 * the same way they resolve anyone (code or number), and sets a new code the
 * customer chooses out loud.
 *
 * Deliberately NOT self-service: a "forgot my code?" link on the diner side
 * would need SMS to prove possession of the number, and until that exists such
 * a link would be a way to take over any account by typing its phone number.
 *
 * It is scoped to the shop's OWN cardholders, and the scoping is enforced HERE.
 *
 * It used to lean on resolveCustomer for that, on the reasoning that resolving
 * through the café "only ever returns a customer of THIS café". That was false
 * and it was the more dangerous kind of false — the comment asserted the check
 * that was missing. resolveCustomer's phone branch calls the global getAccount()
 * on purpose, because crediting a WALK-IN who has never been here is a feature.
 * Reused as authorisation, it meant any owner — and signup is open, free and
 * instant — could type any Tunisian number into the till and rewrite that
 * account's PIN. pin_hash lives on `accounts`, not on a card, so that is not
 * "their customer at my shop": it is the person's whole Pointili identity, and
 * their points, at every shop they hold a card with.
 *
 * The rule now: resetting requires that they are a cardholder HERE. Crediting
 * deliberately does not, and must not.
 */
export type ResetPinResult = { ok: boolean; error?: string; message?: string };

export async function resetPinAction(ref: string, newPin: string): Promise<ResetPinResult> {
  const cafe = await ownerCafe();
  if (!cafe) return { ok: false, error: "Non autorisé." };

  const pin = String(newPin ?? "").trim();
  const { isValidPin, hashPin } = await import("@/lib/auth/crypto");
  if (!isValidPin(pin)) return { ok: false, error: "Le code doit contenir 4 chiffres." };

  const who = await resolveCustomer(cafe.id, ref);
  if ("error" in who) return { ok: false, error: who.error };

  /*
    THE authorisation check. resolveCustomer does not perform one — it resolves
    anybody, including a walk-in this shop has never served, which is exactly
    what crediting needs. Membership is asked for explicitly here, server-side:
    the client also hides the button behind `enrolled`, but that is a courtesy
    to the cashier, not a gate — this action is a public HTTP endpoint.
  */
  if (!(await isCardholder(cafe.id, who.phone))) {
    return { ok: false, error: "Ce client n'a pas de carte chez vous." };
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const db = createAdminClient();

  /*
    RECORDED, AND RATIONED — because of what a reset actually hands over.

    The membership check above is real, and it is not the whole story:
    pin_hash lives on `accounts`, which is GLOBAL. After this call the shop
    knows a customer's number and their secret code, which is the credential
    for that person's whole Pointili identity — their cards and their points at
    every OTHER shop.

    The feature stays: it is the only recovery path in the product, and the
    customer is standing at the counter. What it gets is a trace and a ceiling.
    pin_reset_gate (0043) counts and inserts in one statement, so five resets a
    day is the budget and the sixth is refused — a café resets a code now and
    then; somebody working through a list of numbers does not.
  */
  const { data: gate } = await db.rpc("pin_reset_gate", {
    p_business_id: cafe.id,
    p_phone: who.phone,
  });
  const g = gate as { ok?: boolean; reason?: string } | null;
  if (!g?.ok) {
    return {
      ok: false,
      error:
        g?.reason === "rate_limited"
          ? "Trop de réinitialisations aujourd'hui. Réessayez demain."
          : "Impossible de changer le code.",
    };
  }

  const { data, error } = await db
    .from("accounts")
    .update({ pin_hash: await hashPin(pin) })
    .eq("phone", who.phone)
    .select("phone");

  if (error) return { ok: false, error: "Impossible de changer le code." };
  if (!data?.length) {
    // A walk-in credited before signing up has no account row to reset.
    return { ok: false, error: "Ce client n'a pas encore de compte." };
  }

  // Clear any lockout: the whole point is that they can get back in now.
  await db.from("pin_attempts").delete().eq("phone", who.phone);

  revalidatePath("/owner");
  return { ok: true, message: `Code réinitialisé pour ${customerLabel(who)}.` };
}
