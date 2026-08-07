import { activeNotices, adminOverview, platformStats, recentActions, remaining, renewalQueue, traffic } from "@/lib/platform";
import { Traffic } from "./Traffic";
import type { AdminCafe } from "@/lib/platform";
import { dismissNoticeAction, quickRenewAction, quickUnsuspendAction } from "./actions";
import { BroadcastForm } from "./CafeControls";
import { CafeTable } from "./CafeTable";
import { Renewals } from "./Renewals";

const KIND_LABEL: Record<string, string> = { info: "Info", warning: "Attention", urgent: "Urgent" };

export const metadata = { title: "Console" };

/**
 * The platform console — a QUEUE to clear, not a dashboard to read.
 *
 * The old page opened with a title, a five-tile stat grid, then the whole café
 * table, then a broadcast form, then notices, then the journal: everything the
 * console can do, all at once, in the order it was built. But an operator does
 * not open this to browse. They open it to answer one question — "is anything
 * waiting on me?" — and on most days the honest answer is no.
 *
 * So the page is now: the answer, then the work, then the archive.
 *
 *   1. one line of context, small, no headline
 *   2. À TRAITER — one row per café that needs a decision, WITH the decision on
 *      the row. Renewing used to mean opening a drawer and filling three
 *      fields to do the most common thing on the screen; it is one button now.
 *   3. everything else — the searchable table
 *   4. occasional tools (broadcast, notices, journal), folded away
 *
 * When nothing needs attention the screen says so in one line, and that is the
 * console working correctly.
 */
export default async function AdminPage() {
  const [stats, cafes, actions, notices, trafficData, renewals] = await Promise.all([
    platformStats(),
    adminOverview(),
    recentActions(12),
    activeNotices(),
    traffic(30),
    renewalQueue(),
  ]);

  const cafeName = new Map(cafes.map((c) => [c.id, c.name]));
  const rows = cafes.map((c) => ({ ...c, left: remaining(c.planExpiresAt) }));

  /*
    The queue, in the order an operator should deal with it: a suspended café is
    dark right now, an expired one went dark on its own, and "expires soon" is
    the only one that is still merely a warning.
  */
  const queue = [
    ...rows.filter((r) => r.suspendedAt).map((r) => ({ row: r, kind: "suspended" as const })),
    ...rows.filter((r) => !r.suspendedAt && r.left.expired).map((r) => ({ row: r, kind: "expired" as const })),
    ...rows
      .filter((r) => !r.suspendedAt && !r.left.expired && r.left.soon && !r.left.unlimited)
      .map((r) => ({ row: r, kind: "soon" as const })),
  ];

  return (
    <div className="space-y-7">
      {/* ── context, deliberately one quiet line ─────────────────────── */}
      <p className="font-mono text-[12px] text-[#5b6478]">
        {stats.cafes} café{stats.cafes === 1 ? "" : "s"}
        <span className="text-[#343c4f]"> · </span>
        {stats.live} en ligne
        <span className="text-[#343c4f]"> · </span>
        {stats.diners} diner{stats.diners === 1 ? "" : "s"}
        <span className="text-[#343c4f]"> · </span>
        {stats.pointsIssued.toLocaleString("fr-FR")} points émis
      </p>

      {/* ── 1. the work ──────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#8b93a7]">
          À traiter{queue.length > 0 && ` (${queue.length})`}
        </h2>

        {queue.length === 0 ? (
          <p className="rounded-lg border border-[#232838] bg-[#12151d] px-4 py-5 text-[13px] text-[#5b6478]">
            Rien à traiter. Aucun café expiré, suspendu, ni proche de l&apos;échéance.
          </p>
        ) : (
          <ul className="space-y-2">
            {queue.map(({ row, kind }) => (
              <QueueRow key={row.id} row={row} kind={kind} />
            ))}
          </ul>
        )}
      </section>

      {/* ── 1b. the money queue ──────────────────────────────────────
              Above the table and below the alerts: a shop that has PAID and is
              waiting is more urgent than one that is merely expiring, and it is
              the only thing here somebody is actively waiting on. */}
      <Renewals rows={renewals} />

      {/* ── 2. everything else ───────────────────────────────────────── */}
      {cafes.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#8b93a7]">
            Tous les cafés
          </h2>
          {/* remaining() is server-only, so each row carries its own verdict */}
          <CafeTable rows={rows} />
        </section>
      )}

      {/* ── 3. the trafic — the only part of the console about people who
              have NOT signed up yet, which is exactly what ad money buys ── */}
      <Traffic data={trafficData} />

      {/* ── 4. occasional tools, folded away ─────────────────────────── */}
      <Drawer label="Message à tous les cafés">
        <BroadcastForm />
      </Drawer>

      {notices.length > 0 && (
        <Drawer label={`Annonces actives (${notices.length})`}>
          <ul className="space-y-2">
            {notices.map((n) => (
              <li
                key={n.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-[#232838] bg-[#0e1118] px-3.5 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[#5b6478]">
                    {n.businessId ? (cafeName.get(n.businessId) ?? "café") : "tous les cafés"}
                    {" · "}
                    {KIND_LABEL[n.kind] ?? n.kind}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-[#e6e8ee]">{n.message}</span>
                  <span className="mt-0.5 block text-[10.5px] text-[#5b6478]">
                    {n.expiresAt ? `expire dans ${remaining(n.expiresAt).label}` : "sans expiration"}
                  </span>
                </span>
                <form action={dismissNoticeAction.bind(null, n.id)} className="shrink-0">
                  <button
                    type="submit"
                    className="rounded border border-[#232838] px-2.5 py-1.5 text-[11px] font-medium text-[#8b93a7] hover:text-[#e6e8ee]"
                  >
                    Retirer
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Drawer>
      )}

      {actions.length > 0 && (
        <Drawer label={`Journal (${actions.length})`}>
          <ul className="divide-y divide-[#232838]">
            {actions.map((a, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="text-[12px] text-[#e6e8ee]">
                    {actionLabel(a.action)}
                    {actionTarget(a.action, a.cafe) && (
                      <span className="text-[#5b6478]">{" · "}{actionTarget(a.action, a.cafe)}</span>
                    )}
                  </span>
                  <span className="block truncate font-mono text-[10.5px] text-[#4b5163]">
                    {a.actor ?? "—"}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10.5px] text-[#4b5163]">
                  {new Date(a.at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        </Drawer>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  THE QUEUE                                                             */
/* ══════════════════════════════════════════════════════════════════════ */

type Kind = "suspended" | "expired" | "soon";

/**
 * One café that needs a decision, with the decision attached.
 *
 * The two renew buttons are the whole point: extending by six months or a year
 * is what an operator does nearly every time, and it used to cost a drawer, a
 * plan select, an amount and a unit. The drawer still exists in the table below
 * for anything unusual.
 */
function QueueRow({
  row,
  kind,
}: {
  row: AdminCafe & { left: ReturnType<typeof remaining> };
  kind: Kind;
}) {
  const tone =
    kind === "suspended"
      ? { dot: "bg-[#e5484d]", text: "text-[#e5484d]" }
      : kind === "expired"
        ? { dot: "bg-[#e5484d]", text: "text-[#e5484d]" }
        : { dot: "bg-[#e0a52e]", text: "text-[#e0a52e]" };

  const why =
    kind === "suspended"
      ? `Suspendu — ${row.suspendedReason || "sans raison"}`
      : kind === "expired"
        ? "Abonnement expiré — accès coupé"
        : `Expire dans ${row.left.label}`;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[#232838] bg-[#12151d] px-4 py-3">
      <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-[#e6e8ee]">{row.name}</span>
        <span className={`block truncate text-[11.5px] ${tone.text}`}>{why}</span>
      </span>

      <span className="hidden shrink-0 font-mono text-[11px] text-[#4b5163] sm:block">
        /{row.slug}
      </span>

      {kind === "suspended" ? (
        <form action={quickUnsuspendAction} className="shrink-0">
          <input type="hidden" name="businessId" value={row.id} />
          <input type="hidden" name="suspend" value="0" />
          <button type="submit" className="k-quick">
            Réactiver
          </button>
        </form>
      ) : (
        <span className="flex shrink-0 gap-1.5">
          <Renew id={row.id} plan={row.plan} amount={6} label="+6 mois" />
          <Renew id={row.id} plan={row.plan} amount={12} label="+1 an" />
        </span>
      )}
    </li>
  );
}

/** One renewal button. Keeps the café's current plan unless it is still 'trial',
 *  which a paying renewal should promote to 'pro'. */
function Renew({
  id,
  plan,
  amount,
  label,
}: {
  id: string;
  plan: AdminCafe["plan"];
  amount: number;
  label: string;
}) {
  return (
    <form action={quickRenewAction}>
      <input type="hidden" name="businessId" value={id} />
      <input type="hidden" name="plan" value={plan === "trial" ? "pro" : plan} />
      <input type="hidden" name="amount" value={amount} />
      <input type="hidden" name="unit" value="months" />
      <button type="submit" className="k-quick">
        {label}
      </button>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */

/** A section that is occasionally useful and never urgent. Native <details>, so
 *  it costs no JavaScript and remembers nothing — which is correct here. */
function Drawer({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-[#232838] bg-[#12151d]">
      <summary className="cursor-pointer list-none px-4 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#8b93a7] hover:text-[#e6e8ee] [&::-webkit-details-marker]:hidden">
        <span className="inline-block w-3 text-[#4b5163] transition-transform group-open:rotate-90">
          ›
        </span>
        {label}
      </summary>
      <div className="border-t border-[#232838] px-4 py-3.5">{children}</div>
    </details>
  );
}

/**
 * The audit log stores raw action codes (set_plan, notice, …). An operator
 * scanning the journal wants to read what happened, not decode it — so map each
 * code to plain French, and fall back to the raw code for anything new.
 */
const ACTION_LABELS: Record<string, string> = {
  set_plan: "Abonnement modifié",
  suspend: "Café suspendu",
  unsuspend: "Café réactivé",
  notice: "Message envoyé",
  dismiss_notice: "Annonce retirée",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/**
 * The target line, honest about scope: a notice with no café is a genuine
 * platform-wide broadcast, while plan/suspend are ALWAYS café-scoped, so a
 * missing café means it was since deleted — say so rather than implying it hit
 * everyone.
 */
function actionTarget(action: string, cafe: string | null): string | null {
  if (cafe) return cafe;
  return action === "notice" ? "tous les cafés" : "café supprimé";
}
