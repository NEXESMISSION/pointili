import "server-only";
import { requireElevatedSuperAdmin } from "./auth/owner";
import { adminRpc } from "./adminRpc";
import { createAdminClient } from "./supabase/admin";

/**
 * The platform layer — elevated super-admin only.
 *
 * Three independent gates, because this surface can disable someone's business:
 *   1. requireElevatedSuperAdmin() — signed in, role = super_admin, AND a
 *      step-up re-auth within the last 30 minutes (lib/auth/elevate.ts).
 *   2. the RPC re-verifies the actor's role in Postgres against `profiles`.
 *   3. the RPCs are revoked from anon/authenticated entirely.
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
  // Throws NEEDS_ELEVATION if the step-up has lapsed; the id is then re-verified
  // against profiles inside the RPC.
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
/* Notices — the platform talking to an owner                                  */
/* -------------------------------------------------------------------------- */

export type Notice = {
  id: string;
  kind: "info" | "warning" | "urgent";
  message: string;
  createdAt: string;
};

/** Notices an owner should see. NOT super-admin gated — owners read their own. */
export async function ownerNotices(businessId: string): Promise<Notice[]> {
  const db = createAdminClient();
  const { data } = await db.rpc("owner_notices", { p_business_id: businessId });
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
