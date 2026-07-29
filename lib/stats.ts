import "server-only";
import { createAdminClient } from "./supabase/admin";

/**
 * Analytics — the numbers that answer the only question an owner actually has:
 * "is this making people come back, and is it costing me more than it earns?"
 *
 * Deliberately NOT vanity metrics. Signups and spins don't pay rent. Every
 * figure here is either a behaviour change (do they return? how much faster?) or
 * money (revenue attributed, cost of rewards, net).
 */

/**
 * Below this many paying customers, a repeat RATE is noise: with 1 customer it
 * is either 0% or 100%, and neither means anything. The UI must refuse to draw
 * a conclusion under this threshold rather than flatter the owner.
 */
export const MIN_SAMPLE = 5;

/** Days in the selected window. 0 = everything since the shop opened. */
export type Range = 7 | 30 | 0;

/**
 * The same handful of figures for one stretch of time, so the selected window
 * can be put side by side with the one before it. A number with nothing to
 * compare it to is not an insight — "42 visites" only means something next to
 * last week's 30.
 */
export type Window = {
  revenue: number;
  visits: number;
  newCustomers: number;
  activeCustomers: number;
};

export type Stats = {
  range: Range;
  /** The selected window. */
  window: Window;
  /** The equally long stretch immediately before it — null when out of history. */
  previous: Window | null;
  /** Bars for the window: at most 30, widened when the window is longer. */
  series: { at: number; revenue: number; visits: number }[];
  /** Days per bar in `series` — 1 for 7j/30j, wider for "Tout". */
  bucketDays: number;

  // the headline
  repeatRate: number; // % of customers who came back at least once
  repeatCustomers: number;
  customers: number;
  newCustomers30d: number;
  /** false → too few customers to conclude anything. */
  confident: boolean;
  pointsPerTnd: number;

  // behaviour
  visitsPerCustomer: number; // average purchases per customer
  medianDaysBetween: number | null; // typical gap between visits
  returnedWithin30d: number; // % of last month's new customers who came back

  // money
  revenueTnd: number; // total spend credited through the caisse
  revenue30d: number;
  avgTicketTnd: number;
  rewardCostTnd: number; // points redeemed, valued at the café's own rate
  netTnd: number;

  // engagement
  pointsIssued: number;
  pointsRedeemed: number;
  outstandingPoints: number; // liability: points owed but not yet spent
  rewardsClaimed: number;
  pendingCodes: number;

  // trend
  daily: { day: string; revenue: number; visits: number; newCustomers: number }[];
  topRewards: { label: string; claimed: number }[];
};

type LedgerRow = {
  customer_phone: string;
  delta: number;
  reason: string;
  created_at: string;
};

const DAY = 86_400_000;

export async function getStats(businessId: string, range: Range = 30): Promise<Stats> {
  const db = createAdminClient();

  const [{ data: ledger }, { data: stampRewards }, { data: wins }, { data: redemptions }, { data: program }] =
    await Promise.all([
      db
        .from("points_ledger")
        .select("customer_phone, delta, reason, created_at")
        .eq("business_id", businessId)
        .order("created_at"),
      db.from("stamp_rewards").select("status, label").eq("business_id", businessId),
      db.from("wins").select("status, prize_id, prizes(label)").eq("business_id", businessId),
      db
        .from("loyalty_redemptions")
        .select("status, reward_id, loyalty_rewards(label, points_cost)")
        .eq("business_id", businessId),
      db
        .from("loyalty_programs")
        .select("points_per_tnd")
        .eq("business_id", businessId)
        .maybeSingle(),
    ]);

  const rows = (ledger ?? []) as LedgerRow[];
  const pointsPerTnd = Number(program?.points_per_tnd ?? 1) || 1;
  const now = Date.now();

  // ── purchases, grouped by customer ────────────────────────────────
  // Only 'earn' rows are purchases. Welcome bonuses aren't visits — counting
  // them would make every signup look like a paying customer.
  const purchases = rows.filter((r) => r.reason === "earn");
  const byPhone = new Map<string, number[]>();
  for (const r of purchases) {
    const at = new Date(r.created_at).getTime();
    byPhone.set(r.customer_phone, [...(byPhone.get(r.customer_phone) ?? []), at]);
  }

  /*
    People who have BOUGHT — byPhone is built from 'earn' rows only, so a
    signup who has never been to the counter is not counted here.

    The comment that used to sit on this line said the opposite ("every phone
    the café has ever touched, incl. welcome-only signups"). It was wrong, and
    it was load-bearing: Analyses gates its empty state on this number, so a
    shop with cards and no purchases was told "Pas encore de client" while the
    Caisse screen listed those same people by name. Cardholders are counted by
    cafeCardCount() in lib/db.ts; these two are different populations on
    purpose and must not be confused again.
  */
  const customers = byPhone.size;
  const repeatCustomers = [...byPhone.values()].filter((v) => v.length > 1).length;

  // ── typical gap between visits (median, not mean: one outlier shouldn't
  //    move it) ────────────────────────────────────────────────────────
  const gaps: number[] = [];
  for (const times of byPhone.values()) {
    const sorted = [...times].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) gaps.push((sorted[i] - sorted[i - 1]) / DAY);
  }
  gaps.sort((a, b) => a - b);
  const medianDaysBetween = gaps.length
    ? Math.round(gaps[Math.floor(gaps.length / 2)] * 10) / 10
    : null;

  // ── the retention question: of the people who first bought in the last 30
  //    days, how many came back? ──────────────────────────────────────
  let cohort = 0;
  let cohortReturned = 0;
  for (const times of byPhone.values()) {
    const first = Math.min(...times);
    if (now - first <= 30 * DAY) {
      cohort++;
      if (times.some((t) => t > first)) cohortReturned++;
    }
  }

  // ── money ─────────────────────────────────────────────────────────
  // Revenue is reconstructed from the points the caisse credited, at the café's
  // own rate. It is therefore ONLY the spend that went through Pointili.
  const earnedPoints = purchases.reduce((s, r) => s + r.delta, 0);
  const revenueTnd = earnedPoints / pointsPerTnd;
  const revenue30d =
    purchases
      .filter((r) => now - new Date(r.created_at).getTime() <= 30 * DAY)
      .reduce((s, r) => s + r.delta, 0) / pointsPerTnd;

  const pointsIssued = rows.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0);
  const pointsRedeemed = rows
    .filter((r) => r.reason === "redeem")
    .reduce((s, r) => s + Math.abs(r.delta), 0);
  const outstandingPoints = rows.reduce((s, r) => s + r.delta, 0);

  // What the rewards actually cost, valued at the same rate the café sells at.
  const rewardCostTnd = pointsRedeemed / pointsPerTnd;

  // ── daily trend, last 30 days ─────────────────────────────────────
  const firstSeen = new Map<string, number>();
  for (const [phone, times] of byPhone) firstSeen.set(phone, Math.min(...times));

  const daily: Stats["daily"] = [];
  for (let i = 29; i >= 0; i--) {
    const start = new Date(now - i * DAY).setHours(0, 0, 0, 0);
    const end = start + DAY;
    const inDay = purchases.filter((r) => {
      const t = new Date(r.created_at).getTime();
      return t >= start && t < end;
    });
    daily.push({
      day: new Date(start).toISOString().slice(0, 10),
      revenue: Math.round((inDay.reduce((s, r) => s + r.delta, 0) / pointsPerTnd) * 100) / 100,
      visits: inDay.length,
      newCustomers: [...firstSeen.values()].filter((t) => t >= start && t < end).length,
    });
  }

  /* ── the selected window, and the one before it ────────────────────
     Both are measured the same way, so the two are actually comparable. */
  const at = (r: LedgerRow) => new Date(r.created_at).getTime();
  const measure = (from: number, to: number): Window => {
    const inside = purchases.filter((r) => at(r) >= from && at(r) < to);
    return {
      revenue: Math.round((inside.reduce((s, r) => s + r.delta, 0) / pointsPerTnd) * 100) / 100,
      visits: inside.length,
      newCustomers: [...firstSeen.values()].filter((t) => t >= from && t < to).length,
      activeCustomers: new Set(inside.map((r) => r.customer_phone)).size,
    };
  };

  // "Tout" starts at the first purchase (or today, on an empty shop).
  const firstAt = purchases.length ? Math.min(...purchases.map(at)) : now;
  const spanDays = range || Math.max(1, Math.ceil((now - firstAt) / DAY));
  // Windows end at midnight tomorrow so today's sales are inside the window.
  const windowEnd = new Date(now).setHours(24, 0, 0, 0);
  const windowStart = windowEnd - spanDays * DAY;

  const window = measure(windowStart, windowEnd);
  // Only compare against a stretch the shop actually lived through.
  const previous =
    windowStart - spanDays * DAY >= firstAt - DAY
      ? measure(windowStart - spanDays * DAY, windowStart)
      : null;

  // At most 30 bars: one day each for 7j/30j, wider for a long history.
  const bucketDays = Math.max(1, Math.ceil(spanDays / 30));
  const buckets = Math.ceil(spanDays / bucketDays);
  const series: Stats["series"] = [];
  for (let i = buckets - 1; i >= 0; i--) {
    const end = windowEnd - i * bucketDays * DAY;
    const start = end - bucketDays * DAY;
    const inside = purchases.filter((r) => at(r) >= start && at(r) < end);
    series.push({
      at: start,
      revenue: Math.round((inside.reduce((s, r) => s + r.delta, 0) / pointsPerTnd) * 100) / 100,
      visits: inside.length,
    });
  }

  // ── which rewards people actually want ────────────────────────────
  // PostgREST types an embedded to-one join as an array; at runtime it can be
  // either an object or a 1-element array depending on the relation. Normalise.
  const joinLabel = (v: unknown): string => {
    const row = Array.isArray(v) ? v[0] : v;
    return (row as { label?: string } | null)?.label ?? "—";
  };

  const claimed = new Map<string, number>();
  for (const r of (redemptions ?? []) as { status: string; loyalty_rewards: unknown }[]) {
    if (r.status !== "claimed") continue;
    const label = joinLabel(r.loyalty_rewards);
    claimed.set(label, (claimed.get(label) ?? 0) + 1);
  }
  for (const w of (wins ?? []) as { status: string; prizes: unknown }[]) {
    if (w.status !== "claimed") continue;
    const label = joinLabel(w.prizes);
    claimed.set(label, (claimed.get(label) ?? 0) + 1);
  }
  for (const sr of (stampRewards ?? []) as { status: string; label: string }[]) {
    if (sr.status !== "claimed") continue;
    claimed.set(sr.label, (claimed.get(sr.label) ?? 0) + 1);
  }
  const topRewards = [...claimed.entries()]
    .map(([label, n]) => ({ label, claimed: n }))
    .sort((a, b) => b.claimed - a.claimed)
    .slice(0, 5);

  const pendingCodes =
    ((wins ?? []) as { status: string }[]).filter((w) => w.status === "pending").length +
    ((redemptions ?? []) as { status: string }[]).filter((r) => r.status === "pending").length +
    ((stampRewards ?? []) as { status: string }[]).filter((sr) => sr.status === "pending").length;

  const round = (n: number) => Math.round(n * 100) / 100;

  return {
    range,
    window,
    previous,
    series,
    bucketDays,

    repeatRate: customers ? Math.round((repeatCustomers / customers) * 100) : 0,
    repeatCustomers,
    customers,
    newCustomers30d: [...firstSeen.values()].filter((t) => now - t <= 30 * DAY).length,
    confident: customers >= MIN_SAMPLE,
    pointsPerTnd,

    visitsPerCustomer: customers ? Math.round((purchases.length / customers) * 10) / 10 : 0,
    medianDaysBetween,
    returnedWithin30d: cohort ? Math.round((cohortReturned / cohort) * 100) : 0,

    revenueTnd: round(revenueTnd),
    revenue30d: round(revenue30d),
    avgTicketTnd: purchases.length ? round(revenueTnd / purchases.length) : 0,
    rewardCostTnd: round(rewardCostTnd),
    netTnd: round(revenueTnd - rewardCostTnd),

    pointsIssued,
    pointsRedeemed,
    outstandingPoints,
    rewardsClaimed: [...claimed.values()].reduce((s, n) => s + n, 0),
    pendingCodes,

    daily,
    topRewards,
  };
}

/** Total diners known to the platform (super-admin view). */
export async function getPlatformStats() {
  const db = createAdminClient();
  const [{ count: cafes }, { count: diners }] = await Promise.all([
    db.from("businesses").select("id", { count: "exact", head: true }),
    db.from("accounts").select("phone", { count: "exact", head: true }),
  ]);
  return { cafes: cafes ?? 0, diners: diners ?? 0 };
}
