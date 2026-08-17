import "server-only";
import { adminRpc } from "./adminRpc";
import { createAdminClient } from "./supabase/admin";
import type { EarlyLead, EarlyStats, EarlyStatus, EarlyWant } from "./early";

/*
  The words, the types and the two display helpers live in lib/early, which does
  NOT import "server-only" — the console's panel is a Client Component and needs
  them. Re-exported here so a server file has one import rather than two, the
  same way lib/i18n re-exports lib/dict.
*/
export * from "./early";

/**
 * The early-access list — the shops that asked to be first.
 *
 * TWO HALVES WITH VERY DIFFERENT DOORS, which is why they share a file rather
 * than a gate:
 *
 *   · submit / answer  — PUBLIC. Anyone who can load /early reaches these. They
 *     go through the service-role client directly, exactly like record_visit
 *     (lib/../app/api/visit), because there is nobody to authenticate. The
 *     functions behind them can only write, and only their own row.
 *   · everything else  — adminRpc, which means signed in, super_admin, and the
 *     role re-checked inside Postgres. This list is Tunisian business owners'
 *     phone numbers; reading it is privileged.
 *
 * See supabase/migrations/0039 for what is and is not defended against on the
 * public half.
 */

/* -------------------------------------------------------------------------- */
/* The public half                                                             */
/* -------------------------------------------------------------------------- */

export type SubmitResult =
  | { ok: true; id: string }
  | { ok: false; reason: "bad_name" | "bad_type" | "bad_phone" | "down" };

/**
 * Take a lead. Returns the row's id — which the caller keeps SERVER-SIDE (see
 * app/early/actions.ts: it goes into an httpOnly cookie), so the thank-you
 * question can be attached to it without the id ever reaching the browser.
 *
 * A database failure comes back as `down` rather than being swallowed. This is
 * the opposite call from the visit beacon, which answers 204 whatever happens:
 * a lost analytics row costs a data point, and a lost lead costs a customer. If
 * this fails the person must be told, because nobody is going to call them.
 */
export async function submitEarlyAccess(
  name: string,
  type: string,
  phone: string,
  source: string | null,
): Promise<SubmitResult> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("submit_early_access", {
    p_business_name: name,
    p_business_type: type,
    p_phone: phone,
    p_source: source,
  });

  const r = data as { ok?: boolean; id?: string; reason?: string } | null;
  if (error || !r?.ok || !r.id) {
    const reason = r?.reason;
    if (reason === "bad_name" || reason === "bad_type" || reason === "bad_phone") {
      return { ok: false, reason };
    }
    return { ok: false, reason: "down" };
  }
  return { ok: true, id: r.id };
}

/** The one optional answer, after the row already exists. Best-effort by design. */
export async function answerEarlyAccess(id: string, want: EarlyWant): Promise<boolean> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("answer_early_access", { p_id: id, p_want: want });
  return !error && (data as { ok?: boolean } | null)?.ok === true;
}

/* -------------------------------------------------------------------------- */
/* The console half                                                            */
/* -------------------------------------------------------------------------- */

export async function earlyLeads(limit = 200): Promise<EarlyLead[]> {
  const data = await adminRpc<Record<string, unknown>[]>("admin_early_access", { p_limit: limit });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.business_name),
    type: String(r.business_type),
    phone: String(r.phone),
    want: (r.want as EarlyWant | null) ?? null,
    source: (r.source as string | null) ?? null,
    status: r.status as EarlyStatus,
    note: (r.note as string | null) ?? null,
    createdAt: String(r.created_at),
    handledAt: (r.handled_at as string | null) ?? null,
  }));
}

const NO_STATS: EarlyStats = {
  days: 30, total: 0, new: 0, clients: 0, recent: 0, visits: 0, byType: [], byWant: [],
};

export async function earlyStats(days = 30): Promise<EarlyStats> {
  const data = await adminRpc<Record<string, unknown>>("admin_early_access_stats", { p_days: days });
  const d = data as (Record<string, unknown> & { ok?: boolean }) | null;
  if (!d || d.ok === false) return NO_STATS;
  return {
    days: Number(d.days ?? 30),
    total: Number(d.total ?? 0),
    new: Number(d.new ?? 0),
    clients: Number(d.clients ?? 0),
    recent: Number(d.recent ?? 0),
    visits: Number(d.visits ?? 0),
    byType: ((d.by_type ?? []) as { type: string; n: number }[]).map((t) => ({
      type: String(t.type),
      n: Number(t.n),
    })),
    byWant: ((d.by_want ?? []) as { want: string; n: number }[]).map((w) => ({
      want: w.want as EarlyWant,
      n: Number(w.n),
    })),
  };
}

