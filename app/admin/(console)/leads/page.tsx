import { earlyLeads, earlyStats } from "@/lib/earlyAccess";
import { businessType } from "@/lib/businessTypes";
import { WANT_LABEL } from "@/lib/early";
import { PageHead, Section, Stat } from "../ui";
import { Leads } from "./Leads";

export const metadata = { title: "Accès anticipé" };

/**
 * ACCÈS ANTICIPÉ — the shops that are not customers yet.
 *
 * Before launch this is the busiest page in the console and the one that
 * decides whether there is a business; it spent its first day as a band halfway
 * down a dashboard, between the renewal queue and a café table.
 *
 * ── THE RATE, NOT THE TOTAL ───────────────────────────────────────────────
 *
 * "42 demandes" is a number to feel good about. "42 of the 700 people who
 * opened the page" is a fact about whether the pitch works, and "8 of 700" is
 * the same fact saying something urgent. Neither is readable without the
 * denominator, so the denominator is computed in SQL beside the numerator
 * rather than left in another panel for somebody to divide in their head. It
 * counts sessions whose ENTRY page was /early — the same definition the traffic
 * page uses, and the only one that means "of the people this page received".
 *
 * ── AND THE BREAKDOWN IS MARKET RESEARCH WE DO NOT OTHERWISE HAVE ─────────
 *
 * Which trades actually want this is currently a guess — the product is named
 * after cafés and sells to "commerces". Knowing the list is 60% beauty salons
 * before a single shop has been sold is worth more than knowing it is long.
 */
export default async function LeadsPage() {
  const [rows, stats] = await Promise.all([earlyLeads(500), earlyStats(30)]);

  const fresh = rows.filter((r) => r.status === "new");
  const rate = stats.visits > 0 ? Math.round((stats.recent / stats.visits) * 100) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead
        title="Accès anticipé"
        context={
          rows.length === 0
            ? "Personne n'a encore rempli le formulaire."
            : `${fresh.length} à rappeler sur ${rows.length} demande${rows.length === 1 ? "" : "s"}.`
        }
      >
        <a
          href="/early"
          target="_blank"
          rel="noopener"
          className="k-btn k-btn--sm k-btn--ghost"
        >
          Voir la page ↗
        </a>
      </PageHead>

      <div className="mb-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat
          label="À rappeler"
          value={stats.new}
          sub="personne ne leur a écrit"
          tone={stats.new > 0 ? "warn" : undefined}
        />
        <Stat label="Demandes" value={stats.total} sub={`${stats.clients} devenus clients`} />
        <Stat
          label="Visites de la page"
          value={stats.visits}
          sub={`sur ${stats.days} jours`}
        />
        {/*
          A "0 %" computed from zero visits is not a low conversion rate, it is
          no measurement — and on the panel whose entire job is to say whether
          the page works, that difference is the whole thing.
        */}
        <Stat
          label="Conversion"
          value={rate === null ? "—" : `${rate} %`}
          sub={
            rate === null
              ? "aucune visite mesurée"
              : `${stats.recent} demandes / ${stats.visits} visites`
          }
          tone={rate === null ? undefined : rate >= 10 ? "ok" : rate >= 3 ? "warn" : "bad"}
        />
      </div>

      {(stats.byType.length > 0 || stats.byWant.length > 0) && (
        <Section title="Ce que la liste raconte">
          <div className="grid gap-2.5 lg:grid-cols-2">
            <Bars
              title="Par métier"
              rows={stats.byType.map((t) => {
                const k = businessType(t.type);
                return { label: `${k.emoji} ${k.label}`, n: t.n };
              })}
              empty="Aucune demande."
            />
            <Bars
              title="Ce qui les intéresse"
              rows={stats.byWant.map((w) => ({ label: WANT_LABEL[w.want] ?? w.want, n: w.n }))}
              empty="Personne n'a encore répondu à la question facultative."
            />
          </div>
        </Section>
      )}

      <Section title={`Les demandes${fresh.length > 0 ? ` · ${fresh.length} à rappeler` : ""}`}>
        <Leads rows={rows} />
      </Section>
    </div>
  );
}

/**
 * A breakdown, as bars.
 *
 * Bars rather than a list of counts because both of these questions are
 * comparative — "are we mostly cafés?" is a question about the shape, not the
 * figures — and a column of numbers makes the reader rank them by eye. The
 * figures stay on the row anyway; the bar is the shape and the number is the
 * fact.
 */
function Bars({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { label: string; n: number }[];
  empty: string;
}) {
  const top = Math.max(1, ...rows.map((r) => r.n));

  return (
    <div className="k-card p-4">
      <p className="k-h">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-2.5 text-[12.5px] text-slate">{empty}</p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate text-charcoal">{r.label}</span>
                <span className="k-num shrink-0 font-bold text-charcoal">{r.n}</span>
              </div>
              <span className="mt-1 block h-[5px] overflow-hidden rounded-full bg-[var(--o-inset)]">
                <span
                  className="block h-full rounded-full bg-royal"
                  style={{ width: `${Math.max(4, (r.n / top) * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
