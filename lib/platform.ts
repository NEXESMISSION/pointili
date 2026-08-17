import "server-only";
import { requireElevatedSuperAdmin } from "./auth/owner";
import { adminRpc } from "./adminRpc";
import { createAdminClient } from "./supabase/admin";

/**
 * The platform layer — elevated super-admin only.
 *
 * Three independent gates, because this surface can disable someone's business:
 *   1. requireElevatedSuperAdmin() — signed in, role = super_admin, and the
 *      session re-checked against the AUTH SERVER rather than the token alone,
 *      so a revoked operator stops working immediately (lib/auth/owner).
 *   2. the RPC re-verifies the actor's role in Postgres against `profiles`.
 *   3. EXECUTE on every admin_* function is revoked from public, anon and
 *      authenticated — service_role only (0036, and each migration after it).
 *
 * There is NO step-up re-authentication. This block used to describe one, with
 * a 30-minute window and a `lib/auth/elevate.ts` — that screen was removed and
 * that file has never existed since; the name survived only in comments, which
 * is worse than no comment at all because it reads like a gate that is there.
 *
 * "Only reachable from /admin" is a routing detail, not a security boundary.
 * Reading the platform's books is privileged too, so the reads are gated the
 * same as the writes.
 */

export type Remaining = {
  label: string;
  /** ≤ 7 days — worth warning about. */
  soon: boolean;
  expired: boolean;
  /** null = unlimited (the 'free' plan). */
  unlimited: boolean;
};

/**
 * "3 mois" / "12 j" / "5 h" / "40 min" / "expiré".
 *
 * Plans can now be granted in hours, so a days-only label reads "0 j restants"
 * for a 12-hour grace extension — technically true, useless in practice. Pick
 * the unit that carries information.
 */
export function remaining(iso: string | null): Remaining {
  if (!iso) return { label: "illimité", soon: false, expired: false, unlimited: true };

  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { label: "expiré", soon: true, expired: true, unlimited: false };

  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  const soon = days < 7;

  if (mins < 60) return { label: `${mins} min`, soon: true, expired: false, unlimited: false };
  if (hours < 48) return { label: `${hours} h`, soon: true, expired: false, unlimited: false };
  if (days < 60) return { label: `${days} j`, soon, expired: false, unlimited: false };
  return { label: `${Math.round(days / 30)} mois`, soon: false, expired: false, unlimited: false };
}

export type AdminCafe = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "paused" | "disabled";
  plan: "trial" | "free" | "pro";
  planExpiresAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  live: boolean;
  createdAt: string;
  ownerEmail: string | null;
  customers: number;
  pointsIssued: number;
  plays: number;
  lastActivity: string | null;
};

export type PlatformStats = {
  cafes: number;
  live: number;
  suspended: number;
  expiring7d: number;
  expired: number;
  diners: number;
  owners: number;
  pointsIssued: number;
  plays: number;
};

export type AdminAction = {
  at: string;
  actor: string | null;
  action: string;
  cafe: string | null;
  detail: Record<string, unknown>;
};

export async function adminOverview(): Promise<AdminCafe[]> {
  // Throws UNAUTHORISED / FORBIDDEN via adminRpc's gate; the actor id is then
  // re-verified against profiles inside the RPC itself.
  const data = await adminRpc<AdminCafe[]>("admin_overview");
  return (data as AdminCafe[] | null) ?? [];
}

export async function platformStats(): Promise<PlatformStats> {
  const data = await adminRpc<PlatformStats>("admin_platform_stats");
  return (data as PlatformStats | null) ?? {
    cafes: 0, live: 0, suspended: 0, expiring7d: 0, expired: 0,
    diners: 0, owners: 0, pointsIssued: 0, plays: 0,
  };
}

export async function recentActions(limit = 20): Promise<AdminAction[]> {
  const data = await adminRpc<AdminAction[]>("admin_recent_actions", { p_limit: limit });
  return (data as AdminAction[] | null) ?? [];
}

/* -------------------------------------------------------------------------- */
/* The console's navigation, and the journal as a page                         */
/* -------------------------------------------------------------------------- */

export type ConsoleCounts = {
  cafes: number;
  /** Shops that are dark now or go dark within the week. */
  alerts: number;
  renewals: number;
  leads: number;
  notices: number;
  visits7d: number;
};

const NO_COUNTS: ConsoleCounts = {
  cafes: 0, alerts: 0, renewals: 0, leads: 0, notices: 0, visits7d: 0,
};

/**
 * The six numbers on the navigation.
 *
 * Every page in the console renders the nav, so this is the one read that runs
 * on all of them — which is exactly why it is its own RPC and returns no rows.
 * Deriving these from the full reads would make the traffic page load every
 * café, every renewal and every lead in order to draw six badges.
 */
export async function consoleCounts(): Promise<ConsoleCounts> {
  const data = await adminRpc<Record<string, unknown>>("admin_counts");
  const d = data as (Record<string, unknown> & { ok?: boolean }) | null;
  if (!d || d.ok === false) return NO_COUNTS;
  return {
    cafes: Number(d.cafes ?? 0),
    alerts: Number(d.alerts ?? 0),
    renewals: Number(d.renewals ?? 0),
    leads: Number(d.leads ?? 0),
    notices: Number(d.notices ?? 0),
    visits7d: Number(d.visits7d ?? 0),
  };
}

export type AuditEntry = {
  at: string;
  actor: string | null;
  action: string;
  businessId: string | null;
  cafe: string | null;
  detail: Record<string, unknown>;
};

/** The journal, paged and optionally narrowed to one shop. */
export async function auditLog(
  businessId: string | null = null,
  limit = 100,
  offset = 0,
): Promise<AuditEntry[]> {
  const data = await adminRpc<Record<string, unknown>[]>("admin_audit_log", {
    p_business_id: businessId,
    p_limit: limit,
    p_offset: offset,
  });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    at: String(r.at),
    actor: (r.actor as string | null) ?? null,
    action: String(r.action),
    businessId: (r.business_id as string | null) ?? null,
    cafe: (r.cafe as string | null) ?? null,
    detail: (r.detail as Record<string, unknown>) ?? {},
  }));
}

/* -------------------------------------------------------------------------- */
/* One shop, as a page                                                         */
/* -------------------------------------------------------------------------- */

export type ShopDetail = {
  shop: {
    id: string;
    name: string;
    slug: string;
    status: AdminCafe["status"];
    businessType: string | null;
    primaryColor: string;
    logoUrl: string | null;
    phone: string | null;
    plan: AdminCafe["plan"];
    planExpiresAt: string | null;
    suspendedAt: string | null;
    suspendedReason: string | null;
    live: boolean;
    createdAt: string;
    ownerId: string | null;
    ownerEmail: string | null;
  };
  program: {
    active: boolean;
    pointsPerTnd: number;
    welcomePoints: number;
    redeemExpiryHours: number;
    stampsEnabled: boolean;
    stampsRequired: number;
    stampReward: string | null;
  } | null;
  totals: {
    customers: number;
    issued: number;
    /** Positive, even though the ledger stores redemptions negative. */
    spent: number;
    entries: number;
    revenueTnd: number;
    lastActivity: string | null;
    newCards30d: number;
    active30d: number;
    earns30d: number;
  };
  daily: { day: string; n: number }[];
  rewards: {
    id: string; label: string; cost: number; active: boolean;
    /** Claimed at the counter. Counted by reward_id since 0047, not by price. */
    taken: number;
    /** Issued and not yet collected — customers with a booked reason to return. */
    pending: number;
  }[];
  /** Customer numbers arrive already masked to their last three digits. */
  ledger: { at: string; who: string; delta: number; reason: string; tnd: number | null }[];
  notices: {
    id: string; kind: string; message: string;
    createdAt: string; expiresAt: string | null; active: boolean;
  }[];
  renewals: (RenewalRequest & { note: string | null })[];
  audit: { at: string; actor: string | null; action: string; detail: Record<string, unknown> }[];
};

/**
 * Everything one shop's page shows, in one round trip.
 *
 * Returns null for a café that does not exist, which the page turns into a 404
 * — an id in the address bar is guessable and "no such shop" must not render as
 * an empty shop with zeroes in it.
 */
export async function cafeDetail(id: string): Promise<ShopDetail | null> {
  const data = await adminRpc<Record<string, unknown>>("admin_cafe_detail", { p_id: id });
  const d = data as (Record<string, unknown> & { ok?: boolean }) | null;
  if (!d || d.ok !== true || !d.shop) return null;

  const t = (d.totals ?? {}) as Record<string, unknown>;
  return {
    shop: d.shop as ShopDetail["shop"],
    program: (d.program ?? null) as ShopDetail["program"],
    totals: {
      customers: Number(t.customers ?? 0),
      issued: Number(t.issued ?? 0),
      spent: Number(t.spent ?? 0),
      entries: Number(t.entries ?? 0),
      revenueTnd: Number(t.revenueTnd ?? 0),
      lastActivity: (t.lastActivity as string | null) ?? null,
      newCards30d: Number(t.newCards30d ?? 0),
      active30d: Number(t.active30d ?? 0),
      earns30d: Number(t.earns30d ?? 0),
    },
    daily: (d.daily ?? []) as ShopDetail["daily"],
    rewards: (d.rewards ?? []) as ShopDetail["rewards"],
    ledger: (d.ledger ?? []) as ShopDetail["ledger"],
    notices: (d.notices ?? []) as ShopDetail["notices"],
    renewals: ((d.renewals ?? []) as Record<string, unknown>[]).map((r) => ({
      ...mapRenewal(r),
      note: (r.note as string | null) ?? null,
    })),
    audit: (d.audit ?? []) as ShopDetail["audit"],
  };
}

/* -------------------------------------------------------------------------- */
/* The customer, who used to be invisible to this console                      */
/* -------------------------------------------------------------------------- */

export type DinerHit = {
  /** Ten opaque characters. The URL key, so no phone number is ever in one. */
  publicId: string;
  code: string;
  name: string | null;
  /** "•••741" — a search is browsing, and browsing does not get phone numbers. */
  phoneMasked: string;
  shops: number;
  points: number;
  lastSeen: string | null;
  createdAt: string;
};

/**
 * Find a person by phone fragment, card code, name, or their opaque id.
 *
 * All four at once, because a support message contains whichever one the person
 * happened to have to hand and the operator should not have to know which kind
 * of thing they were given.
 */
export async function findDiners(q: string, limit = 30): Promise<DinerHit[]> {
  if (!q.trim()) return [];
  const data = await adminRpc<Record<string, unknown>[]>("admin_find_diners", {
    p_q: q,
    p_limit: limit,
  });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    publicId: String(r.public_id),
    code: String(r.code),
    name: (r.name as string | null) ?? null,
    phoneMasked: String(r.phone_masked),
    shops: Number(r.shops ?? 0),
    points: Number(r.points ?? 0),
    lastSeen: (r.last_seen as string | null) ?? null,
    createdAt: String(r.created_at),
  }));
}

export type DinerDetail = {
  person: {
    publicId: string;
    code: string;
    name: string | null;
    /** In full — see the header of migration 0041 for why only here. */
    phone: string;
    createdAt: string;
    /** Seconds of sign-in lockout left, 0 when they are not locked out. */
    lockedFor: number;
  };
  totals: { shops: number; held: number; earned: number; spent: number };
  cards: {
    businessId: string; name: string; slug: string; live: boolean;
    balance: number; code: string | null; since: string; lastOpened: string | null;
  }[];
  ledger: {
    at: string; shop: string | null; businessId: string | null;
    delta: number; reason: string; tnd: number | null;
  }[];
};

export async function dinerDetail(publicId: string): Promise<DinerDetail | null> {
  const data = await adminRpc<Record<string, unknown>>("admin_diner_detail", {
    p_public_id: publicId,
  });
  const d = data as (Record<string, unknown> & { ok?: boolean }) | null;
  if (!d || d.ok !== true || !d.person) return null;

  const t = (d.totals ?? {}) as Record<string, unknown>;
  return {
    person: d.person as DinerDetail["person"],
    totals: {
      shops: Number(t.shops ?? 0),
      held: Number(t.held ?? 0),
      earned: Number(t.earned ?? 0),
      spent: Number(t.spent ?? 0),
    },
    cards: (d.cards ?? []) as DinerDetail["cards"],
    ledger: (d.ledger ?? []) as DinerDetail["ledger"],
  };
}

/* -------------------------------------------------------------------------- */
/* Notices — the platform talking to an owner                                  */
/* -------------------------------------------------------------------------- */

export type Notice = {
  id: string;
  kind: "info" | "warning" | "urgent";
  message: string;
  createdAt: string;
};

/**
 * Notices an owner should see. NOT super-admin gated — owners read their own.
 *
 * THE OWNER IS A REQUIRED ARGUMENT, and the RPC enforces it (0045).
 *
 * This ran on the service-role client with a caller-supplied business id and no
 * predicate tying the two together: hand it any uuid and it returned that
 * shop's notices — operator-written messages ABOUT them. Every call site passes
 * ownerCafe()'s id, so nothing leaked in the shipped product. What it was is
 * the exact footgun lib/adminRpc.ts exists to remove: one future caller reading
 * an id out of a URL is a cross-tenant read that reviews as ordinary code.
 *
 * my_renewal_requests has taken an owner and joined on it since 0035. This is
 * now the same shape.
 */
export async function ownerNotices(businessId: string, ownerId: string): Promise<Notice[]> {
  const db = createAdminClient();
  const { data } = await db.rpc("owner_notices", {
    p_business_id: businessId,
    p_owner: ownerId,
  });
  return (data as Notice[] | null) ?? [];
}

export type ActiveNotice = {
  id: string;
  kind: "info" | "warning" | "urgent";
  message: string;
  createdAt: string;
  expiresAt: string | null;
  /** null = broadcast to every café. */
  businessId: string | null;
};

/**
 * Every notice still live on owners' dashboards — so the super-admin can retract
 * one that was wrong or is now resolved (a posted notice was previously
 * un-retractable from the product). Elevated read; expired ones are dropped
 * since there's nothing to pull back.
 */
export async function activeNotices(): Promise<ActiveNotice[]> {
  await requireElevatedSuperAdmin();
  const db = createAdminClient();
  const { data } = await db
    .from("platform_notices")
    .select("id, kind, message, created_at, expires_at, business_id")
    .eq("active", true)
    .order("created_at", { ascending: false });

  const now = Date.now();
  return (data ?? [])
    .filter((n) => !n.expires_at || new Date(n.expires_at).getTime() > now)
    .map((n) => ({
      id: n.id,
      kind: n.kind,
      message: n.message,
      createdAt: n.created_at,
      expiresAt: n.expires_at,
      businessId: n.business_id,
    }));
}

/* -------------------------------------------------------------------------- */
/* Traffic — did the ads bring anybody                                         */
/* -------------------------------------------------------------------------- */

export type TrafficRow = { visits: number; signups: number };
export type Traffic = {
  days: number;
  totals: TrafficRow & { median_seconds: number };
  sources: (TrafficRow & { source: string })[];
  campaigns: (TrafficRow & { campaign: string })[];
  devices: (TrafficRow & { device: string })[];
  daily: (TrafficRow & { day: string })[];
};

const NO_TRAFFIC: Traffic = {
  days: 30,
  totals: { visits: 0, signups: 0, median_seconds: 0 },
  sources: [], campaigns: [], devices: [], daily: [],
};

/**
 * Visits, sources, devices and dwell time — see supabase/migrations/0028.
 *
 * One RPC rather than five queries: the console draws all of it in one pass,
 * and the numbers have to agree with each other, which they cannot if they are
 * read at five different moments.
 */
export async function traffic(days = 30): Promise<Traffic> {
  const data = await adminRpc<Traffic>("admin_traffic", { p_days: days });
  const d = data as (Traffic & { ok?: boolean }) | null;
  /* ok:false is the RPC's own "not a super-admin" — treat it as no data rather
     than rendering `undefined` into the page */
  if (!d || d.ok === false) return NO_TRAFFIC;
  return { ...NO_TRAFFIC, ...d };
}

/* -------------------------------------------------------------------------- */
/* Renewals — a shop asking to be turned back on, with a receipt attached      */
/* -------------------------------------------------------------------------- */

export type RenewalRequest = {
  id: string;
  offer: "6m" | "12m";
  months: number;
  amount: number;
  method: "d17" | "flouci" | "rib";
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt: string | null;
  decidedNote?: string | null;
};

/** An owner's own recent requests — no receipt bytes, see the RPC. */
export async function myRenewals(ownerId: string, businessId: string): Promise<RenewalRequest[]> {
  const db = createAdminClient();
  const { data } = await db.rpc("my_renewal_requests", {
    p_owner: ownerId,
    p_business_id: businessId,
  });
  return ((data ?? []) as Record<string, unknown>[]).map(mapRenewal);
}

export type AdminRenewal = RenewalRequest & {
  businessId: string;
  name: string;
  slug: string;
  plan: string;
  planExpiresAt: string | null;
  note: string | null;
};

/** The console's queue: pending first, then what was decided recently. */
export async function renewalQueue(limit = 30): Promise<AdminRenewal[]> {
  const data = await adminRpc<Record<string, unknown>[]>("admin_renewal_requests", { p_limit: limit });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...mapRenewal(r),
    businessId: String(r.business_id),
    name: String(r.name),
    slug: String(r.slug),
    plan: String(r.plan),
    planExpiresAt: (r.plan_expires_at as string | null) ?? null,
    note: (r.note as string | null) ?? null,
  }));
}

function mapRenewal(r: Record<string, unknown>): RenewalRequest {
  return {
    id: String(r.id),
    offer: r.offer as RenewalRequest["offer"],
    months: Number(r.months),
    amount: Number(r.amount),
    method: r.method as RenewalRequest["method"],
    status: r.status as RenewalRequest["status"],
    createdAt: String(r.created_at),
    decidedAt: (r.decided_at as string | null) ?? null,
    decidedNote: (r.decided_note as string | null) ?? null,
  };
}
