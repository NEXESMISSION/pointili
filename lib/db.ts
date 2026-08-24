import "server-only";
import { cache } from "react";
import { createAdminClient } from "./supabase/admin";
import { DEFAULT_TICKET_INFO, MIN_TICKET_SAMPLE, type Ticket } from "./rewards";
import type { ActiveCode } from "./types";

/**
 * The data layer — Supabase.
 *
 * Every value-changing call goes through a Postgres RPC (see
 * supabase/migrations/0003_rpcs.sql), which is where the rules actually live:
 * balance checks, the welcome-once rule, cooldowns, and prize odds. Those RPCs
 * are `security definer` and revoked from anon/authenticated, so the service-role
 * key used here is the ONLY way to reach them — and it never leaves the server.
 *
 * The browser never sends a points figure, a prize, or a cost. It sends an id
 * and a session cookie; the server decides everything else.
 */

/* -------------------------------------------------------------------------- */
/* Accounts (diners — phone + PIN, not Supabase Auth)                          */
/* -------------------------------------------------------------------------- */

export type AccountRow = {
  phone: string;
  pin_hash: string;
  name: string | null;
  public_id: string;
  /** The 4-char code the diner shows at ANY counter. One per person. */
  code: string;
};

export async function getAccount(phone: string): Promise<AccountRow | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("accounts")
    .select("phone, pin_hash, name, public_id, code")
    .eq("phone", phone)
    .maybeSingle();
  if (error) throw new Error(`getAccount: ${error.message}`);
  return data ?? null;
}

/**
 * Resolve a scanned/typed short code → the customer.
 *
 * The code is the ACCOUNT's, so this resolves platform-wide — including someone
 * who has never set foot in this shop. businessId is still passed because the
 * RPC also falls back to the legacy per-shop code, so anything already printed
 * keeps working at the shop it came from.
 */
export async function cardByCode(
  businessId: string,
  code: string,
): Promise<{ phone: string; name: string | null; code: string | null } | null> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("card_by_code", { p_business_id: businessId, p_code: code });
  if (error) throw new Error(`cardByCode: ${error.message}`);
  return (data as { phone: string; name: string | null; code: string | null } | null) ?? null;
}

/**
 * Does this phone hold a card at THIS shop?
 *
 * Since the code went account-wide it can no longer stand in for membership —
 * everyone has one. This is the per-shop relationship row, and it is what
 * "enrolled" means. A ledger row alone is NOT membership: a cashier crediting a
 * phone must not silently enrol them.
 */
export async function isCardholder(businessId: string, phone: string): Promise<boolean> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("diner_cafes")
    .select("phone")
    .eq("business_id", businessId)
    .eq("phone", phone)
    .maybeSingle();
  if (error) throw new Error(`isCardholder: ${error.message}`);
  return Boolean(data);
}

/**
 * Create the global diner identity.
 *
 * Returns ok:false instead of throwing when the row already exists: signup is a
 * check-then-act race (two submits of the same new phone both see "no account"),
 * and the loser is the SAME person — the caller re-reads and logs them in rather
 * than dropping them on an error screen.
 */
export async function createAccount(
  phone: string,
  pinHash: string,
  name: string | null,
): Promise<{ ok: boolean }> {
  const db = createAdminClient();
  // Through the RPC, never a raw insert: minting the 4-char code needs a retry
  // loop on collision, and a column DEFAULT cannot retry.
  const { data, error } = await db.rpc("create_account", {
    p_phone: phone,
    p_pin_hash: pinHash,
    p_name: name,
  });
  if (error) throw new Error(`createAccount: ${error.message}`);
  return { ok: data === true };
}

/* -------------------------------------------------------------------------- */
/* PIN throttling — a 4-digit PIN is 10k combinations                          */
/* -------------------------------------------------------------------------- */

/**
 * The brute-force gate — counts this attempt AND says whether it may proceed.
 *
 * Replaces the pinLockedFor() → verify → pinFail() sequence, which was
 * check-then-act: a hundred concurrent requests all read "not locked" before
 * any of them was counted, so all hundred PINs were evaluated. pin_gate takes
 * an advisory lock on the phone and records the attempt BEFORE the caller
 * verifies anything (see migration 0038).
 *
 * Returns minutes still locked; 0 means "you may try". Call pinClear() on a
 * successful sign-in to give the diner their allowance back.
 */
export async function pinGate(phone: string): Promise<number> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("pin_gate", { p_phone: phone });
  if (error) throw new Error(`pinGate: ${error.message}`);
  return (data as number | null) ?? 0;
}

export async function pinLockedFor(phone: string): Promise<number> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("pin_locked_for", { p_phone: phone });
  if (error) throw new Error(`pinLockedFor: ${error.message}`);
  return (data as number | null) ?? 0;
}

export async function pinFail(phone: string) {
  const db = createAdminClient();
  await db.rpc("pin_fail", { p_phone: phone, p_max: 5, p_minutes: 15 });
}

export async function pinClear(phone: string) {
  const db = createAdminClient();
  await db.rpc("pin_clear", { p_phone: phone });
}

/* -------------------------------------------------------------------------- */
/* Points                                                                      */
/* -------------------------------------------------------------------------- */

/*
  A BALANCE THAT COULD NOT BE FETCHED IS NOT A BALANCE OF ZERO.

  This used to swallow the error and `?? 0`, so one dropped RPC — a reset
  connection, a slow pooler, a 5xx from PostgREST — told a customer holding 340
  points that they had none, on the one screen the whole product exists to show
  them. It is transient, so it is right again on a refresh, which is precisely
  what makes it read as "the app lost my points" rather than as a failed
  request.

  It is worse at the counter, where the same number is what the cashier reads
  out before deciding whether a reward can be taken.

  Zero is a real balance and has to stay reachable — a new card genuinely has
  none. So the RPC returning NULL still means zero; only a failed call throws.
*/
export async function getBalance(businessId: string, phone: string): Promise<number> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("pointili_balance", {
    p_business_id: businessId,
    p_phone: phone,
  });
  if (error) throw new Error(`getBalance: ${error.message}`);
  return (data as number | null) ?? 0;
}

export async function getStamps(
  businessId: string,
  phone: string,
): Promise<{ count: number; startedAt: string | null }> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("loyalty_stamps")
    .select("count, started_at")
    .eq("business_id", businessId)
    .eq("phone", phone)
    .maybeSingle();
  if (error) throw new Error(`getStamps: ${error.message}`);
  return { count: data?.count ?? 0, startedAt: data?.started_at ?? null };
}

export type StampResult =
  | { ok: true; count: number; required: number; completed: boolean; code: string | null; label: string }
  | { ok: false; reason: string };

/** Manual "+1 tampon" at the counter. Completes + issues a code when full. */
export async function addStamp(businessId: string, phone: string, delta = 1): Promise<StampResult> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("add_stamp", {
    p_business_id: businessId,
    p_phone: phone,
    p_delta: delta,
  });
  if (error) return { ok: false, reason: error.message };
  return data as StampResult;
}

/**
 * The two figures a preview needs to promise what the server will actually
 * grant: an active "points doublés" event, and the sub-point remainder banked
 * from this customer's previous visits (0026).
 */
export async function pointsPreviewInputs(
  businessId: string,
  phone: string,
): Promise<{ multiplier: number; carry: number }> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("points_preview_inputs", {
    p_business_id: businessId,
    p_phone: phone,
  });
  if (error) throw new Error(`pointsPreviewInputs: ${error.message}`);
  const r = (data ?? {}) as { multiplier?: number; carry?: number };
  return { multiplier: Number(r.multiplier ?? 1) || 1, carry: Number(r.carry ?? 0) || 0 };
}

/**
 * The same multiplier, with NOBODY IN HAND.
 *
 * The till asks for the amount before it knows who is paying — so the "+12
 * points" it promises while the cashier is still keying dinars has to be
 * computed without a phone. It can be, and exactly: the multiplier comes from
 * cafe_events and is a property of the SHOP and the hour, not of the customer
 * (pointili_active_multiplier, 0003_rpcs.sql), and the per-customer half of
 * points_preview_inputs was retired in 0027 — `carry` has been a constant 0
 * ever since. The empty phone is therefore not a placeholder standing in for a
 * real one; it is an argument the function no longer reads.
 *
 * Falls back to 1 rather than throwing. This feeds a preview on the owner's
 * home screen, and the number that actually lands is computed server-side by
 * credit_points either way. A shop whose events table hiccups should see the
 * base rate for a second, not a till that will not open.
 */
export async function activePointsMultiplier(businessId: string): Promise<number> {
  try {
    const { multiplier } = await pointsPreviewInputs(businessId, "");
    return multiplier;
  } catch (e) {
    console.error("[till] active multiplier unreadable:", e);
    return 1;
  }
}

export type CreditResult =
  | { ok: true; earned: number; welcome: number; balance: number; multiplier: number }
  | { ok: false; reason: string };

/** Consume → Earn. The RPC computes the points from the owner's rate. */
export async function creditPoints(
  businessId: string,
  phone: string,
  amountTnd: number,
): Promise<CreditResult> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("credit_points", {
    p_business_id: businessId,
    p_phone: phone,
    p_amount_tnd: amountTnd,
  });
  if (error) return { ok: false, reason: error.message };
  return data as CreditResult;
}

/* -------------------------------------------------------------------------- */
/* Play                                                                        */
/* -------------------------------------------------------------------------- */

export type SpinRpcResult =
  | {
      ok: true;
      prizeId: string;
      prizeIndex: number;
      prizeLabel: string;
      code: string;
      cost: number;
      balance: number;
    }
  | { ok: false; reason: "insufficient"; balance: number; needed: number }
  | { ok: false; reason: "off" | "unavailable" };

/**
 * The Spin — paid for in points.
 *
 * There is no cost argument, and there never can be one: spin_wheel reads the
 * price off the games row itself, the same way redeem_at_counter reads a
 * reward's price off the catalogue. The client says "spin", nothing more.
 *
 * There is no prize argument either. The draw happens in the database, over
 * active segments, uniformly. A client that picked its own prize would be a
 * client that always won the best one.
 */
export async function spinWheel(
  businessId: string,
  phone: string,
): Promise<SpinRpcResult> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("spin_wheel", {
    p_business_id: businessId,
    p_phone: phone,
  });
  if (error) throw new Error(error.message);
  return data as SpinRpcResult;
}

/* -------------------------------------------------------------------------- */
/* Redeem + codes                                                              */
/* -------------------------------------------------------------------------- */

export type RedeemRpcResult =
  | { ok: true; code: string; label: string; balance: number }
  | { ok: false; reason: "insufficient"; balance: number; needed: number }
  | { ok: false; reason: "unavailable" };

export async function redeemAtCounter(
  businessId: string,
  phone: string,
  rewardId: string,
): Promise<RedeemRpcResult> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("redeem_at_counter", {
    p_business_id: businessId,
    p_phone: phone,
    p_reward_id: rewardId,
  });
  if (error) throw new Error(error.message);
  return data as RedeemRpcResult;
}

export async function getCodes(businessId: string, phone: string): Promise<ActiveCode[]> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("diner_codes", {
    p_business_id: businessId,
    p_phone: phone,
  });
  if (error) throw new Error(`getCodes: ${error.message}`);
  return (data as ActiveCode[] | null) ?? [];
}

export type PeekResult =
  | { found: false; status: "not_found" }
  | {
      found: true;
      label: string;
      kind: "win" | "reward" | "stamp";
      status: "valid" | "expired" | "claimed";
    };

/**
 * Look up a code WITHOUT serving it (read-only).
 *
 * The counter flow is two-step on purpose: staff first sees what a code is and
 * whether it can be served, then decides to collect it — a diner sometimes just
 * wants to show it, not spend it. This never changes state.
 */
export async function peekCode(businessId: string, code: string): Promise<PeekResult> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("peek_code", {
    p_business_id: businessId,
    p_code: code,
  });
  if (error) return { found: false, status: "not_found" };
  return data as PeekResult;
}

export type ClaimResult =
  | { ok: true; label: string; kind: "win" | "reward" | "stamp" }
  | { ok: false; reason: string };

/** Claim a counter code — exactly once, guarded inside the RPC. */
export async function claimCode(businessId: string, code: string): Promise<ClaimResult> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("claim_code", {
    p_business_id: businessId,
    p_code: code,
  });
  if (error) return { ok: false, reason: error.message };
  return data as ClaimResult;
}

/* -------------------------------------------------------------------------- */
/* Wallet — every café where this phone has a card                             */
/* -------------------------------------------------------------------------- */

export type WalletCafe = {
  businessId: string;
  name: string;
  slug: string;
  businessType: string;
  primaryColor: string;
  logoUrl: string | null;
  lastOpenedAt: string | null;
  balance: number;
  /** Is the shop still running a stamp card? Progress is meaningless if not. */
  stampsEnabled: boolean;
  stamps: number;
  pendingWins: number;
  pendingRewards: number;
};

/** Mark that the diner just opened this card — powers the wallet's recency sort. */
/**
 * What this diner's balance was the last time they looked, and what it is now.
 *
 * The pair is the whole point: a reward is worth celebrating on the customer's
 * screen only if it became affordable SINCE they last saw the card. Comparing
 * against the current balance alone would congratulate them again on every
 * refresh for something they claimed a week ago.
 *
 * Must be read BEFORE touchCardOpened, which is what moves the goalposts.
 */
export async function balanceSinceLastOpen(
  businessId: string,
  phone: string,
): Promise<{ before: number; now: number; firstOpen: boolean }> {
  const db = createAdminClient();
  /* Two independent reads — the mark and the ledger. They ran in series, which
     made this the slowest thing on the card screen for no reason at all. */
  const [{ data: card }, { data: rows }] = await Promise.all([
    db
      .from("diner_cafes")
      .select("last_opened_at")
      .eq("business_id", businessId)
      .eq("phone", phone)
      .maybeSingle(),
    db
      .from("points_ledger")
      .select("delta, created_at")
      .eq("business_id", businessId)
      .eq("customer_phone", phone),
  ]);

  const all = (rows ?? []) as { delta: number; created_at: string }[];
  const now = all.reduce((s, r) => s + Number(r.delta), 0);

  /*
    Never opened it? Then nothing has happened "since" — returning `now` for
    both makes the diff empty.

    firstOpen rides back out because it is the ONLY honest signal for "this
    person is seeing this card for the first time", and the card screen needs
    it. That screen used to play its arrival off a ?nouveau=1 URL flag set by
    the join action — which meant a card created FOR someone at the counter (a
    walk-in, credited before they had ever signed up) silently appeared with no
    arrival at all, and re-joining a shop you already belonged to played one
    when nothing had been added. last_opened_at cannot be wrong about this: it
    is null exactly once per card, ever.
  */
  const seenAt = card?.last_opened_at ? new Date(card.last_opened_at).getTime() : null;
  if (seenAt === null) return { before: now, now, firstOpen: true };

  const before = all
    .filter((r) => new Date(r.created_at).getTime() <= seenAt)
    .reduce((s, r) => s + Number(r.delta), 0);

  return {
    before: Math.round(before * 100) / 100,
    now: Math.round(now * 100) / 100,
    firstOpen: false,
  };
}

export async function touchCardOpened(businessId: string, phone: string): Promise<void> {
  const db = createAdminClient();
  await db
    .from("diner_cafes")
    .update({ last_opened_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("phone", phone);
}

/**
 * Record that this diner has a card at this café (the "passport").
 *
 * Idempotent. This is the membership marker: it makes the café show up in the
 * diner's wallet even before they've earned a single point — so joining always
 * creates a visible card, and the "am I enrolled here?" check can't loop when a
 * café's welcome bonus happens to be zero.
 */
export async function enrollDiner(cafeId: string, phone: string): Promise<string | null> {
  const db = createAdminClient();
  // The RPC is idempotent. It still returns the legacy per-shop code; the code
  // shown to the diner now comes from their account.
  // Returning it lets the caller PROVE enrollment worked — /[slug] bounces
  // non-members back to /rejoindre, so a silent failure loops forever.
  const { data, error } = await db.rpc("enroll_diner", {
    p_business_id: cafeId,
    p_phone: phone,
  });
  /*
    Throw, do not return null. The comment above says null means "enrolment did
    not work" and that the caller must check it — but `if (error) return null`
    made a failed CALL wear the same face as a refusal, and /rejoindre then
    redirected to /[slug], which bounces a non-member straight back here. That
    is the forever-loop this function was shaped to prevent, reintroduced by the
    line that was meant to prevent it.
  */
  if (error) throw new Error(`enrollDiner: ${error.message}`);
  return (data as string | null) ?? null;
}

/**
 * The diner's whole wallet: one card per café they've ever earned or played at.
 *
 * The account (phone + PIN) is GLOBAL — one identity everywhere — but points are
 * strictly PER café (the ledger is keyed by business_id + phone), so each café
 * is its own card with its own balance. This lets a diner see all their cards
 * and jump between them without re-scanning a QR.
 */
/* cache(): the shop layout counts the cards for the switcher and the card page
   lists them for the same switcher — one RPC, asked twice, every render. */
export const dinerWallet = cache(async function dinerWallet(phone: string): Promise<WalletCafe[]> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("diner_wallet", { p_phone: phone });
  if (error) throw new Error(`dinerWallet: ${error.message}`);
  return (data as WalletCafe[] | null) ?? [];
});

/* -------------------------------------------------------------------------- */
/* Activity                                                                    */
/* -------------------------------------------------------------------------- */

export type Activity = {
  delta: number;
  /* 'spin' since 0029: diner_history selects every ledger row without
     filtering by reason, so a wheel debit arrives in this feed. It was absent
     from this union, which meant the history screen showed a blank label for
     anyone who had played. */
  reason: "earn" | "redeem" | "welcome" | "adjust" | "expire" | "collected" | "spin";
  /** Set for 'collected' rows — the prize/reward the diner picked up. */
  label: string | null;
  /**
   * What the customer actually paid, for a purchase — null for everything
   * else. A welcome bonus and a correction have no ticket, and "0 TND" beside
   * them would be worse than silence. See 0034.
   */
  amount: number | null;
  at: string;
};

/**
 * The diner's recent history: points events PLUS what they collected at the
 * counter, merged into one timeline (see the diner_history RPC).
 *
 * "Where did my points come from?" is the first question anyone asks of a
 * loyalty balance — and "what did I already pick up?" is the second. A card that
 * can't answer either feels like a black box.
 */
export async function getActivity(
  businessId: string,
  phone: string,
  limit = 8,
): Promise<Activity[]> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("diner_history", {
    p_business_id: businessId,
    p_phone: phone,
    p_limit: limit,
  });
  if (error) throw new Error(`getActivity: ${error.message}`);
  return (data as Activity[] | null) ?? [];
}

/* -------------------------------------------------------------------------- */
/* Café creation                                                               */
/* -------------------------------------------------------------------------- */

/**
 * "Café de l'Étoile & Co" → "cafe-de-letoile-co".
 *
 * The slug is the café's public URL, so it has to survive a French keyboard:
 * accents, apostrophes, ampersands. Apostrophes are DROPPED rather than turned
 * into separators — "l'étoile" should read "letoile", not "l-etoile".
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents: é → e
    .replace(/['’`]/g, "") // l'étoile → letoile
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export type CreateCafeResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; reason: "slug_taken" | "slug_reserved" | "slug_invalid" };

/** Set the café's category (validated key) — used at creation and in settings. */
export async function setBusinessType(businessId: string, type: string): Promise<void> {
  const db = createAdminClient();
  await db.from("businesses").update({ business_type: type }).eq("id", businessId);
}

/**
 * The card's face, set during signup.
 *
 * Both fields are optional and both are written in ONE update, so a shop that
 * gives neither costs no round trip. The logo is a data URI — the browser has
 * already downscaled it (see fileToLogoDataUri), which is why there is no
 * storage bucket anywhere in this product.
 */
export async function setCafeIdentity(
  businessId: string,
  fields: { logoUrl?: string | null; phone?: string | null },
): Promise<void> {
  const patch: Record<string, string | null> = {};
  if (fields.logoUrl !== undefined) patch.logo_url = fields.logoUrl;
  if (fields.phone !== undefined) patch.phone = fields.phone;
  if (Object.keys(patch).length === 0) return;

  const db = createAdminClient();
  await db.from("businesses").update(patch).eq("id", businessId);
}

export async function createCafe(
  ownerId: string,
  name: string,
  slug: string,
): Promise<CreateCafeResult> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("create_cafe", {
    p_owner_id: ownerId,
    p_name: name,
    p_slug: slug,
  });
  if (error) return { ok: false, reason: "slug_invalid" };
  return data as CreateCafeResult;
}

/* -------------------------------------------------------------------------- */
/* Owner card management — correct one cardholder, addressed by code           */
/* -------------------------------------------------------------------------- */

/**
 * How many people hold a card at this café.
 *
 * Deliberately NOT the same number as `Stats.customers`, which counts people
 * who have bought. Enrolling at the QR writes a diner_cafes row and no ledger
 * row, so a shop can have cards and no purchases — and Analyses needs to be
 * able to tell those two emptinesses apart instead of calling both "pas encore
 * de client".
 */
/**
 * What one visit is worth at THIS counter, in dinars.
 *
 * Rewards are priced in visits now (lib/rewards.ts) and a visit is only worth
 * what this shop's customers actually spend — 2,5 DT in a café, 30 DT at a
 * hairdresser. Quoting "5 visites" off a platform-wide guess would be wrong by
 * an order of magnitude for half the trades on the business-type list.
 *
 * Reads amount_tnd, the dinars the cashier keyed, and ignores rows written
 * before migration 0024 added the column — those genuinely do not know their
 * amount, and a NULL must not be averaged in as a zero.
 */
export async function cafeAvgTicket(businessId: string): Promise<Ticket> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("points_ledger")
    .select("amount_tnd")
    .eq("business_id", businessId)
    .eq("reason", "earn")
    .not("amount_tnd", "is", null);
  if (error) throw new Error(`cafeAvgTicket: ${error.message}`);

  const amounts = ((data ?? []) as { amount_tnd: number }[]).map((r) => Number(r.amount_tnd));
  if (amounts.length < MIN_TICKET_SAMPLE) return DEFAULT_TICKET_INFO;

  const mean = amounts.reduce((s, n) => s + n, 0) / amounts.length;
  // A shop that somehow recorded only zeroes must not price every reward at 1.
  if (!(mean > 0)) return DEFAULT_TICKET_INFO;
  return { tnd: Math.round(mean * 100) / 100, measured: true };
}

export async function cafeCardCount(businessId: string): Promise<number> {
  const db = createAdminClient();
  const { count } = await db
    .from("diner_cafes")
    .select("phone", { count: "exact", head: true })
    .eq("business_id", businessId);
  return count ?? 0;
}

/*
  The browsable cardholder list is gone from the till (the owner asked for the
  counter to be the counter and nothing else), so ownerCards()/OwnerCard went
  with it. The owner_cards RPC is left in place — it is granted to service_role
  only, and keeping it means putting the list back is a component, not a
  migration.
*/

/** Correct a cardholder's points (an 'adjust' ledger row). */
export async function ownerAdjustPoints(
  businessId: string,
  phone: string,
  delta: number,
  /**
   * The dinars this correction reverses, when it reverses a known sale.
   *
   * null for a manual "+10 / -5" — that has no sale behind it and must stay out
   * of the revenue sum. Passed only by the till's undo, so a mistyped 600 comes
   * off Analyses as well as off the customer's balance (0025).
   */
  amountTnd: number | null = null,
): Promise<{ ok: boolean; balance: number }> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("owner_adjust_points", {
    p_business_id: businessId,
    p_phone: phone,
    p_delta: delta,
    p_amount_tnd: amountTnd,
  });
  if (error) return { ok: false, balance: 0 };
  return data as { ok: boolean; balance: number };
}

/** Set a cardholder's stamp progress (0..required-1). */
export async function ownerSetStamps(
  businessId: string,
  phone: string,
  count: number,
): Promise<{ ok: boolean; count: number; required: number }> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("owner_set_stamps", {
    p_business_id: businessId,
    p_phone: phone,
    p_count: count,
  });
  if (error) return { ok: false, count: 0, required: 10 };
  return data as { ok: boolean; count: number; required: number };
}

/** When may this diner spin again? null = now. */
export async function nextPlayAt(gameId: string, phone: string, cooldownHours: number) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("plays")
    .select("created_at")
    .eq("game_id", gameId)
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`nextPlayAt: ${error.message}`);

  if (!data) return null;
  const next = new Date(data.created_at).getTime() + cooldownHours * 3600_000;
  return next > Date.now() ? new Date(next) : null;
}

/* -------------------------------------------------------------------------- */
/* What the shop's own screens can finally say                                 */
/* -------------------------------------------------------------------------- */

export type OwnerToday = {
  /** Dinars through the till today, from `earn` rows only. */
  takings: number;
  visits: number;
  points: number;
  newCards: number;
  rewards: number;
  /** Yesterday to the SAME HOUR — see 0042 for why not the whole day. */
  yTakings: number;
  yVisits: number;
  /** The last twelve operations at this counter. Names shown, numbers masked. */
  feed: {
    at: string;
    who: string;
    /** Last three digits — the till has never shown a full number. */
    tail: string;
    delta: number;
    reason: string;
    tnd: number | null;
  }[];
};

const NO_DAY: OwnerToday = {
  takings: 0, visits: 0, points: 0, newCards: 0, rewards: 0,
  yTakings: 0, yVisits: 0, feed: [],
};

/**
 * How the shift is going — the four numbers the till could never say.
 *
 * "Today" is the calendar day in Tunis, not the last 24 hours: an owner asking
 * how today went means the day they are standing in. See 0042.
 */
export async function ownerToday(businessId: string): Promise<OwnerToday> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("owner_today", { p_business_id: businessId });
  if (error || !data) return NO_DAY;
  const d = data as Record<string, unknown>;
  return {
    takings: Number(d.takings ?? 0),
    visits: Number(d.visits ?? 0),
    points: Number(d.points ?? 0),
    newCards: Number(d.newCards ?? 0),
    rewards: Number(d.rewards ?? 0),
    yTakings: Number(d.yTakings ?? 0),
    yVisits: Number(d.yVisits ?? 0),
    feed: (d.feed ?? []) as OwnerToday["feed"],
  };
}

export type OwnerReward = {
  id: string;
  label: string;
  cost: number;
  active: boolean;
  position: number;
  imageUrl: string | null;
  /** Claimed at the counter. */
  taken: number;
  /** Issued and not yet collected — people with a reason to come back. */
  pending: number;
  lastTaken: string | null;
};

/**
 * The reward ladder, with how often each one is actually taken.
 *
 * The owner picks four rewards and four prices at setup and has never had any
 * feedback at all. The console has had this since 0040; the shop it is about
 * has not.
 */
export async function ownerRewards(businessId: string): Promise<OwnerReward[]> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("owner_rewards", { p_business_id: businessId });
  if (error) throw new Error(`ownerRewards: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    label: String(r.label),
    cost: Number(r.points_cost),
    active: Boolean(r.active),
    position: Number(r.position),
    imageUrl: (r.image_url as string | null) ?? null,
    taken: Number(r.taken ?? 0),
    pending: Number(r.pending ?? 0),
    lastTaken: (r.last_taken as string | null) ?? null,
  }));
}

/* -------------------------------------------------------------------------- */
/* The people behind the counter (0048)                                        */
/* -------------------------------------------------------------------------- */

export type StaffMember = {
  id: string;
  name: string;
  role: "owner" | "manager" | "cashier";
};

/**
 * The tiles on the sign-in screen.
 *
 * NEVER SELECTS pin_hash. That column has exactly one legitimate reader — the
 * verify path in the sign-in action — and this list is rendered into HTML that
 * every person behind the counter is looking at. Naming the columns rather than
 * `select("*")` is what keeps that true when somebody adds a column later.
 */
export async function listStaff(businessId: string): Promise<StaffMember[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("staff")
    .select("id, name, role")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("created_at");
  if (error) throw new Error(`listStaff: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    role: r.role as StaffMember["role"],
  }));
}

export type StaffEntry = {
  id: string;
  name: string;
  role: "owner" | "manager" | "cashier";
  createdAt: string;
  /** How many recorded actions carry this person's id — "did they ever work?" */
  actions: number;
  lastAt: string | null;
};

/** The team, with enough history beside each name to be worth reading. */
export async function staffTeam(businessId: string): Promise<StaffEntry[]> {
  const db = createAdminClient();
  const [people, feed] = await Promise.all([
    db
      .from("staff")
      .select("id, name, role, created_at")
      .eq("business_id", businessId)
      .eq("active", true)
      .order("created_at"),
    db
      .from("staff_actions")
      .select("staff_id, at")
      .eq("business_id", businessId)
      .not("staff_id", "is", null)
      .order("at", { ascending: false })
      .limit(2000),
  ]);
  if (people.error) throw new Error(`staffTeam: ${people.error.message}`);

  const counts = new Map<string, { n: number; last: string }>();
  for (const row of (feed.data ?? []) as { staff_id: string; at: string }[]) {
    const seen = counts.get(row.staff_id);
    /* The feed is ordered newest first, so the FIRST row for a person is their
       most recent one — no comparison needed. */
    if (seen) seen.n += 1;
    else counts.set(row.staff_id, { n: 1, last: row.at });
  }

  return ((people.data ?? []) as Record<string, unknown>[]).map((r) => {
    const c = counts.get(String(r.id));
    return {
      id: String(r.id),
      name: String(r.name),
      role: r.role as StaffEntry["role"],
      createdAt: String(r.created_at),
      actions: c?.n ?? 0,
      lastAt: c?.last ?? null,
    };
  });
}

export type StaffAction = {
  who: string;
  role: string | null;
  kind: string;
  customer: string | null;
  points: number | null;
  amountTnd: number | null;
  label: string | null;
  at: string;
};

/** Who did what, newest first. The answer to "who gave that away?" */
export async function staffJournal(businessId: string, limit = 60): Promise<StaffAction[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("staff_actions")
    .select("staff_name, staff_role, kind, customer, points, amount_tnd, label, at")
    .eq("business_id", businessId)
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`staffJournal: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    who: String(r.staff_name),
    role: (r.staff_role as string | null) ?? null,
    kind: String(r.kind),
    customer: (r.customer as string | null) ?? null,
    points: r.points === null || r.points === undefined ? null : Number(r.points),
    amountTnd: r.amount_tnd === null || r.amount_tnd === undefined ? null : Number(r.amount_tnd),
    label: (r.label as string | null) ?? null,
    at: String(r.at),
  }));
}

/* -------------------------------------------------------------------------- */
/* The pulse — what a customer's open card asks for, over and over             */
/* -------------------------------------------------------------------------- */

export type DinerPulse = {
  balance: number;
  stamps: number;
  /**
   * The rewards still waiting at the counter — the LIST, not a tally.
   *
   * A count answers "did something change"; only the list answers "WHICH one
   * went", and that is the question the moment a reward is collected. The
   * client diffs the two and names what the cashier just took. It is a handful
   * of short strings that already belong to the person asking.
   */
  codes: { code: string; label: string; kind: string }[];
};

/**
 * The three numbers on a customer's card, and nothing else.
 *
 * This is polled by a phone sitting on a counter while the cashier credits it,
 * so it is deliberately the SMALLEST honest answer: no account row, no
 * membership check, no reward ladder. Three reads in ONE round trip's worth of
 * waiting, keyed on (café, phone) — the same pair every other read here uses.
 *
 * It cannot leak: the phone comes from the caller's own signed cookie, so the
 * only numbers anybody can ask for are the ones already printed on the screen
 * they are holding. The phone itself never appears in the answer.
 */
export async function dinerPulse(businessId: string, phone: string): Promise<DinerPulse> {
  const [balance, stamps, codes] = await Promise.all([
    getBalance(businessId, phone),
    getStamps(businessId, phone),
    getCodes(businessId, phone),
  ]);
  return {
    balance,
    stamps: stamps.count,
    codes: codes.map((c) => ({ code: c.code, label: c.label, kind: c.kind })),
  };
}
