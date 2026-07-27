import "server-only";
import { createAdminClient } from "./supabase/admin";
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

export type AccountRow = { phone: string; pin_hash: string; name: string | null; public_id: string };

export async function getAccount(phone: string): Promise<AccountRow | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("accounts")
    .select("phone, pin_hash, name, public_id")
    .eq("phone", phone)
    .maybeSingle();
  return data ?? null;
}

/** Resolve a scanned/typed short code (within one shop) → the customer. */
export async function cardByCode(
  businessId: string,
  code: string,
): Promise<{ phone: string; name: string | null } | null> {
  const db = createAdminClient();
  const { data } = await db.rpc("card_by_code", { p_business_id: businessId, p_code: code });
  return (data as { phone: string; name: string | null } | null) ?? null;
}

/** This diner's short per-shop code (for the "show at counter" card). */
export async function getCardCode(businessId: string, phone: string): Promise<string> {
  const db = createAdminClient();
  const { data } = await db
    .from("diner_cafes")
    .select("code")
    .eq("business_id", businessId)
    .eq("phone", phone)
    .maybeSingle();
  return data?.code ?? "";
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
  const { error } = await db.from("accounts").insert({ phone, pin_hash: pinHash, name });
  return { ok: !error };
}

/* -------------------------------------------------------------------------- */
/* PIN throttling — a 4-digit PIN is 10k combinations                          */
/* -------------------------------------------------------------------------- */

export async function pinLockedFor(phone: string): Promise<number> {
  const db = createAdminClient();
  const { data } = await db.rpc("pin_locked_for", { p_phone: phone });
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

export async function getBalance(businessId: string, phone: string): Promise<number> {
  const db = createAdminClient();
  const { data } = await db.rpc("pointili_balance", {
    p_business_id: businessId,
    p_phone: phone,
  });
  return (data as number | null) ?? 0;
}

export async function getStamps(
  businessId: string,
  phone: string,
): Promise<{ count: number; startedAt: string | null }> {
  const db = createAdminClient();
  const { data } = await db
    .from("loyalty_stamps")
    .select("count, started_at")
    .eq("business_id", businessId)
    .eq("phone", phone)
    .maybeSingle();
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

export type PlayRpcResult =
  | {
      ok: true;
      prizeId: string;
      prizeIndex: number;
      prizeLabel: string;
      isLose: boolean;
      code: string | null;
      nextPlayAt: string;
    }
  | { ok: false; reason: "cooldown"; nextPlayAt: string }
  | { ok: false; reason: "not_found" | "inactive" };

/** The Spin. The server picks the prize by the owner's weights. */
export async function playGame(
  slug: string,
  phone: string,
  device: string | null,
): Promise<PlayRpcResult> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("play_game", {
    p_slug: slug,
    p_phone: phone,
    p_device: device,
  });
  if (error) throw new Error(error.message);
  return data as PlayRpcResult;
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
  const { data } = await db.rpc("diner_codes", {
    p_business_id: businessId,
    p_phone: phone,
  });
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
  // The RPC is idempotent and also assigns the short per-shop code on first join.
  // Returning it lets the caller PROVE enrollment worked — /[slug] bounces
  // non-members back to /rejoindre, so a silent failure loops forever.
  const { data, error } = await db.rpc("enroll_diner", {
    p_business_id: cafeId,
    p_phone: phone,
  });
  if (error) return null;
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
export async function dinerWallet(phone: string): Promise<WalletCafe[]> {
  const db = createAdminClient();
  const { data } = await db.rpc("diner_wallet", { p_phone: phone });
  return (data as WalletCafe[] | null) ?? [];
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                    */
/* -------------------------------------------------------------------------- */

export type Activity = {
  delta: number;
  reason: "earn" | "redeem" | "welcome" | "adjust" | "expire" | "collected";
  /** Set for 'collected' rows — the prize/reward the diner picked up. */
  label: string | null;
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
  const { data } = await db.rpc("diner_history", {
    p_business_id: businessId,
    p_phone: phone,
    p_limit: limit,
  });
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
/* Owner card management — list, search, and correct cardholders               */
/* -------------------------------------------------------------------------- */

export type OwnerCard = {
  phone: string;
  /** Short per-shop code — null for a walk-in who has not signed up yet. */
  code: string | null;
  /** false = credited at the till but never joined; their points are waiting. */
  enrolled: boolean;
  name: string | null;
  balance: number;
  stamps: number;
  cycles: number;
  pending: number;
  lastAt: string | null;
  joinedAt: string;
};

export type OwnerCards = { total: number; cards: OwnerCard[] };

/**
 * Every cardholder at a café, newest-active first, searchable by name/phone.
 *
 * The business_id is resolved from the owner's session before this is called
 * (ownerCafe()), so — like every value RPC here — the service role trusts it.
 */
export async function ownerCards(
  businessId: string,
  search = "",
  limit = 50,
  offset = 0,
): Promise<OwnerCards> {
  const db = createAdminClient();
  const { data } = await db.rpc("owner_cards", {
    p_business_id: businessId,
    p_search: search,
    p_limit: limit,
    p_offset: offset,
  });
  return (data as OwnerCards | null) ?? { total: 0, cards: [] };
}

/** Correct a cardholder's points (an 'adjust' ledger row). */
export async function ownerAdjustPoints(
  businessId: string,
  phone: string,
  delta: number,
): Promise<{ ok: boolean; balance: number }> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("owner_adjust_points", {
    p_business_id: businessId,
    p_phone: phone,
    p_delta: delta,
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
  const { data } = await db
    .from("plays")
    .select("created_at")
    .eq("game_id", gameId)
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const next = new Date(data.created_at).getTime() + cooldownHours * 3600_000;
  return next > Date.now() ? new Date(next) : null;
}
