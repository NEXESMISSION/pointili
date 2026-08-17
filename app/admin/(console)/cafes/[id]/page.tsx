import Link from "next/link";
import { notFound } from "next/navigation";
import { businessType } from "@/lib/businessTypes";
import { cafeDetail, remaining, type ShopDetail } from "@/lib/platform";
import { method as payMethod, tnd } from "@/lib/billing";
import { ago, day, Pill, PLAN_LABEL, PageHead, Section, shopTone, stamp, Stat } from "../../ui";
import { ACTION_LABEL } from "../../journal/labels";
import { ShopControls } from "./ShopControls";
import { DangerZone, IdentityBox, ProgramBox } from "./ShopEdit";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await cafeDetail(id);
  return { title: d?.shop.name ?? "Café" };
}

/**
 * ONE SHOP, AS A PAGE.
 *
 * This is the whole reason the console was rebuilt. A café is the central
 * object of this platform — the thing that pays, the thing that goes dark, the
 * thing somebody rings up about — and it used to be a row in a table that
 * opened a modal containing four aggregate numbers and three form controls.
 *
 * When an owner wrote in saying "my customers lost their points on Tuesday" or
 * "why did Karim only get 3 points on 12 dinars?", the console could not help
 * with either. It had no ledger, no view of the shop's own settings, no record
 * of what WE had done to the account and when. The answer lived in the
 * database, and the operator went to the database.
 *
 * So this page answers, in the order the questions actually arrive:
 *
 *   is it up?          the status band, and the levers to change it
 *   is it working?     thirty days of till activity, zero-filled
 *   is it worth it?    customers, points, dinars through the till
 *   why that number?   the loyalty programme as configured, in plain words
 *   what happened?     the last twenty operations at the counter
 *   what did we do?    renewals, notices sent, and the audit trail
 *
 * ── THE LAYOUT IS THE PRIORITY ────────────────────────────────────────────
 *
 * Controls sit at the TOP of the side column on desktop, and at the top of the
 * page on a phone, because the reason an operator opens a specific shop is
 * almost always to change something about it. The evidence they need in order
 * to decide is beside it, not three screens down.
 */
export default async function ShopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await cafeDetail(id);
  /* An id in the address bar is guessable, and "no such shop" must never render
     as a shop with zeroes in it. */
  if (!d) notFound();

  const { shop, totals, program } = d;
  const left = remaining(shop.planExpiresAt);
  const { tone, label } = shopTone(shop);
  const kind = businessType(shop.businessType);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHead
        back={{ href: "/admin/cafes", label: "Tous les cafés" }}
        title={shop.name}
        context={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Pill tone={tone}>
              <span className={`k-dot k-${tone}`} aria-hidden />
              {label}
            </Pill>
            <span>
              {kind.emoji} {kind.label}
            </span>
            <span className="text-slate/40">·</span>
            <span>créé {day(shop.createdAt)}</span>
            {shop.ownerEmail && (
              <>
                <span className="text-slate/40">·</span>
                <span className="k-num truncate">{shop.ownerEmail}</span>
              </>
            )}
          </span>
        }
      >
        {/* The one thing the console never offered: go and LOOK at the shop the
            way its customers do. Half the questions that reach an operator are
            answered by opening the card. */}
        <a
          href={`/${shop.slug}`}
          target="_blank"
          rel="noopener"
          className="k-btn k-btn--sm k-btn--ghost"
        >
          Voir /{shop.slug} ↗
        </a>
      </PageHead>

      {/* ── the numbers ─────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat
          label="Abonnement"
          value={<span className="text-[18px]">{PLAN_LABEL[shop.plan] ?? shop.plan}</span>}
          sub={
            left.unlimited
              ? "sans limite"
              : left.expired
                ? `expiré le ${day(shop.planExpiresAt)}`
                : `${left.label} · jusqu'au ${day(shop.planExpiresAt)}`
          }
          tone={left.expired ? "bad" : left.soon && !left.unlimited ? "warn" : undefined}
        />
        <Stat
          label="Clients"
          value={totals.customers}
          sub={`${totals.active30d} actifs sur 30 j · ${totals.newCards30d} nouveaux`}
        />
        <Stat
          label="Points émis"
          value={totals.issued.toLocaleString("fr-FR")}
          sub={`${totals.spent.toLocaleString("fr-FR")} dépensés`}
        />
        {/*
          THE FIGURE NOBODY COULD SEE: what actually went through the till.
          points_ledger has stored amount_tnd since 0024 and no screen in the
          console ever read it, so "is this shop worth keeping?" was answerable
          only in points — a unit whose value each shop sets for itself.
        */}
        <Stat
          label="Encaissé via Pointili"
          value={`${Math.round(totals.revenueTnd).toLocaleString("fr-FR")} TND`}
          sub={`${totals.earns30d} passages sur 30 j`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ── the levers ──────────────────────────────────────────────
                First on a phone, side column on desktop: changing something is
                usually why this page was opened. */}
        <div className="order-1 lg:order-2 lg:col-span-4">
          <Section title="Agir">
            <ShopControls shop={shop} />
          </Section>

          {/* ── how the programme is set, AND how to set it ──────────
                  "Why did my client only get 3 points?" is the most common
                  question an operator gets, and the answer is always one of
                  these four numbers. 0040 made them readable; leaving them
                  read-only meant the operator could diagnose the problem and
                  then had to talk somebody through finding their own settings
                  screen while their till was wrong. */}
          <Section title="Réglages du café">
            <div className="space-y-2.5">
              <ProgramBox shop={shop} program={program} />
              <IdentityBox shop={shop} />
            </div>
          </Section>
        </div>

        {/* ── the evidence ───────────────────────────────────────────── */}
        <div className="order-2 lg:order-1 lg:col-span-8">
          <Section
            title="Activité au comptoir"
            aside={`${totals.earns30d} passages · 30 jours`}
          >
            <div className="k-card p-4">
              <Sparkline daily={d.daily} />
              <p className="mt-2.5 text-[11.5px] text-slate">
                Dernier point crédité {ago(totals.lastActivity)}.
                {totals.entries > 0 && ` ${totals.entries} opérations en tout.`}
              </p>
            </div>
          </Section>

          <Section title="Récompenses" aside={`${d.rewards.length} au catalogue`}>
            {d.rewards.length === 0 ? (
              <p className="k-card px-4 py-4 text-[13px] text-slate">
                Aucune récompense — les clients cumulent des points qu&apos;ils ne peuvent pas
                échanger.
              </p>
            ) : (
              <ul className="k-card divide-y divide-[var(--o-edge)]">
                {d.rewards.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
                    <span className={`k-dot k-${r.active ? "ok" : "idle"}`} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-semibold text-charcoal">
                      {r.label}
                      {!r.active && <span className="ms-2 text-[11px] text-slate">désactivée</span>}
                    </span>
                    <span className="k-num shrink-0 text-royal">{r.cost} pts</span>
                    {/*
                      TAKEN, not just listed. A reward nobody has ever redeemed
                      is the most actionable fact about a shop's programme — it
                      is either priced out of reach or nobody wants it.

                      Counted by reward_id since 0047. It used to match the
                      ledger amount against the price, which credited a reward
                      with another one's sales whenever two shared a price — so
                      this line said "1×" about a reward that had never been
                      taken, and the shop's own screen said 0.
                    */}
                    <span className="shrink-0 text-end">
                      <span
                        className={`k-num block text-[11.5px] ${
                          r.taken === 0 ? "text-slate/50" : "text-charcoal"
                        }`}
                      >
                        {r.taken === 0 ? "jamais prise" : `${r.taken}×`}
                      </span>
                      {/* A code in circulation is a customer who is coming
                          back. The shop has seen this since 0042. */}
                      {r.pending > 0 && (
                        <span className="k-num block text-[10.5px] text-slate">
                          {r.pending} à récupérer
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Dernières opérations" aside="numéros masqués">
            {d.ledger.length === 0 ? (
              <p className="k-card px-4 py-4 text-[13px] text-slate">
                Rien n&apos;est jamais passé par cette caisse.
              </p>
            ) : (
              <ul className="k-card divide-y divide-[var(--o-edge)]">
                {d.ledger.map((l, i) => (
                  <li key={i} className="flex items-baseline gap-3 px-4 py-2 text-[12px]">
                    <span className="k-num w-[68px] shrink-0 text-slate" dir="ltr">
                      {l.who}
                    </span>
                    <span className="min-w-0 flex-1 text-charcoal">
                      {LEDGER_LABEL[l.reason] ?? l.reason}
                      {l.tnd ? <span className="k-num text-slate"> · {l.tnd} TND</span> : null}
                    </span>
                    <span
                      className={`k-num shrink-0 font-bold ${
                        l.delta >= 0 ? "text-[#1f7a52]" : "text-[#b3202f]"
                      }`}
                    >
                      {l.delta > 0 ? "+" : ""}
                      {l.delta}
                    </span>
                    <span className="hidden w-[104px] shrink-0 whitespace-nowrap text-end text-[11.5px] text-slate/70 sm:block">
                      {stamp(l.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ── what we did to them ───────────────────────────────────
                  The half of the record the console never showed. "Who
                  suspended this shop, and when?" has been answerable in the
                  database since the first migration and on no screen at all. */}
          <Section title="Ce que la plateforme a fait" aside={`${d.audit.length} entrées`}>
            {d.audit.length === 0 ? (
              <p className="k-card px-4 py-4 text-[13px] text-slate">
                Aucune action administrative sur ce café.
              </p>
            ) : (
              <ul className="k-card divide-y divide-[var(--o-edge)]">
                {d.audit.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2 px-4 py-2 text-[12px]">
                    <span className="font-semibold text-charcoal">
                      {ACTION_LABEL[a.action] ?? a.action}
                    </span>
                    <span className="k-num min-w-0 flex-1 truncate text-slate/70">
                      {a.actor ?? "—"}
                    </span>
                    <span className="k-num shrink-0 text-slate/70">{stamp(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {d.renewals.length > 0 && (
            <Section title="Paiements" aside={`${d.renewals.length} demandes`}>
              <ul className="k-card divide-y divide-[var(--o-edge)]">
                {d.renewals.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 px-4 py-2.5 text-[12px]">
                    <Pill tone={r.status === "approved" ? "ok" : r.status === "rejected" ? "bad" : "warn"}>
                      {r.status === "approved" ? "validé" : r.status === "rejected" ? "refusé" : "en attente"}
                    </Pill>
                    <span className="k-num font-bold text-charcoal">{tnd(r.amount)}</span>
                    <span className="k-num text-slate">
                      {r.months} mois · {payMethod(r.method)?.label ?? r.method}
                    </span>
                    <span className="k-num ms-auto shrink-0 text-slate/70">{day(r.createdAt)}</span>
                    {r.decidedNote && (
                      <span className="w-full text-[11.5px] italic text-slate">« {r.decidedNote} »</span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {d.notices.length > 0 && (
            <Section title="Messages envoyés" aside={`${d.notices.length}`}>
              <ul className="k-card divide-y divide-[var(--o-edge)]">
                {d.notices.map((n) => {
                  const live = n.active && (!n.expiresAt || new Date(n.expiresAt) > new Date());
                  return (
                    <li key={n.id} className="px-4 py-2.5 text-[12px]">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <Pill tone={live ? "ok" : "idle"}>{live ? "affiché" : "retiré"}</Pill>
                        <span className="k-h">{n.kind}</span>
                        <span className="k-num ms-auto text-slate/70">{day(n.createdAt)}</span>
                      </span>
                      <span className="mt-1 block text-charcoal">{n.message}</span>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}
        </div>
      </div>

      {/* Last on the page, under its own heading, in its own colour. Both of
          these are rare and hard to undo; neither belongs one scroll away from
          the button that extends a subscription. */}
      <DangerZone shop={shop} cards={totals.customers} />

      <p className="mt-6 text-[11px] text-slate/70">
        Les numéros des clients sont masqués sur cette page, comme sur la caisse du café —
        cherchez une personne dans{" "}
        <Link href="/admin/clients" className="text-royal">
          Clients
        </Link>{" "}
        pour la fiche complète.{" "}
        <Link href={`/admin/journal?cafe=${shop.id}`} className="text-royal">
          Journal de ce café →
        </Link>
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */

const LEDGER_LABEL: Record<string, string> = {
  earn: "Achat",
  welcome: "Bonus de bienvenue",
  redeem: "Récompense échangée",
  adjust: "Correction",
};

/**
 * Thirty days of till activity.
 *
 * ZERO DAYS ARE DRAWN AS ZERO, not skipped — which is why the series is
 * zero-filled in SQL rather than grouped. A chart that quietly drops empty days
 * renders a shop that closed for a fortnight as a shop that traded steadily
 * throughout, and the gap is the single most useful shape on this page.
 *
 * No library: thirty divs. A charting dependency to draw thirty bars in an
 * internal tool is a dependency to keep patched forever.
 */
function Sparkline({ daily }: { daily: ShopDetail["daily"] }) {
  const peak = Math.max(1, ...daily.map((d) => d.n));
  const total = daily.reduce((s, d) => s + d.n, 0);

  if (total === 0) {
    return (
      <p className="text-[13px] text-slate">
        Aucun passage en trente jours. La caisse de ce café n&apos;a pas servi.
      </p>
    );
  }

  return (
    <>
      <div className="flex h-[64px] items-end gap-[3px]">
        {daily.map((d) => (
          <span
            key={d.day}
            title={`${d.day} · ${d.n} passage${d.n === 1 ? "" : "s"}`}
            className={`flex-1 rounded-t-[2px] ${d.n === 0 ? "bg-[var(--o-edge)]" : "bg-royal"}`}
            /* A zero day still gets 2px of grey. Drawn at 0 it is invisible,
               and an invisible bar reads as "no data for that day" rather than
               "nobody came in". */
            style={{ height: `${d.n === 0 ? 3 : Math.max(8, (d.n / peak) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-slate">
        <span>{day(daily[0]?.day)}</span>
        <span className="k-num">pic {peak}/j</span>
        <span>aujourd&apos;hui</span>
      </div>
    </>
  );
}
