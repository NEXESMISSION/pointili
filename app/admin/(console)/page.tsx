import Link from "next/link";
import { adminOverview, platformStats, remaining, renewalQueue, type AdminCafe } from "@/lib/platform";
import { earlyLeads } from "@/lib/earlyAccess";
import { businessType } from "@/lib/businessTypes";
import { prettyPhone, whatsappLink } from "@/lib/early";
import { tnd, offer as findOffer, method as payMethod } from "@/lib/billing";
import { quickRenewAction, quickUnsuspendAction } from "./actions";
import { ago, day, Dot, Flash, PageHead, Section, shopTone, Stat } from "./ui";

export const metadata = { title: "Aujourd'hui" };

/**
 * AUJOURD'HUI — the only page that is allowed to interrupt.
 *
 * The console used to be one screen holding everything it could say, in the
 * order it was built. This page is the opposite discipline: it shows what needs
 * A DECISION FROM A PERSON TODAY, and nothing else. No roster, no traffic, no
 * audit log, no totals that are merely interesting.
 *
 * The test for anything on this page is: if the operator does nothing about it
 * this week, does something get worse? A suspended shop is dark right now. An
 * expired one went dark on its own. A shop that has TRANSFERRED MONEY is
 * waiting on us and getting nothing. A shop that left its WhatsApp number
 * yesterday goes cold. Everything else lives on a page you choose to open.
 *
 * ── THE ORDER IS THE ARGUMENT ─────────────────────────────────────────────
 *
 * Money already paid comes FIRST, above the shops that are dark. That is a
 * change from the old page and it is deliberate: an expired shop is a
 * situation, but a shop that paid eighty dinars four days ago and is still
 * switched off is us failing to hold up our end — and it is the one thing here
 * that costs trust rather than revenue.
 *
 * On most days all of it is empty, and this page says so in one line. That is
 * the console working correctly, not a page that failed to load.
 */
export default async function TodayPage({
  searchParams,
}: {
  /* Set by the queue's one-tap actions, which are plain server actions with
     nowhere else to put an answer — see backWith() in ./actions. */
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { ok, err } = await searchParams;
  const [stats, cafes, renewals, leads] = await Promise.all([
    platformStats(),
    adminOverview(),
    renewalQueue(),
    earlyLeads(60),
  ]);

  const rows = cafes.map((c) => ({ ...c, left: remaining(c.planExpiresAt) }));

  /* Ordered by how dark the shop is, not by name: suspended is a decision we
     made, expired is one that made itself, "soon" is still only a warning. */
  const alerts = [
    ...rows.filter((r) => r.suspendedAt).map((r) => ({ row: r, kind: "suspended" as const })),
    ...rows.filter((r) => !r.suspendedAt && r.left.expired).map((r) => ({ row: r, kind: "expired" as const })),
    ...rows
      .filter((r) => !r.suspendedAt && !r.left.expired && r.left.soon && !r.left.unlimited)
      .map((r) => ({ row: r, kind: "soon" as const })),
  ];

  const waiting = renewals.filter((r) => r.status === "pending");
  const fresh = leads.filter((l) => l.status === "new");
  const clear = alerts.length === 0 && waiting.length === 0 && fresh.length === 0;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead
        title="Aujourd'hui"
        context={
          clear
            ? "Rien ne demande de décision."
            : `${alerts.length + waiting.length + fresh.length} chose${
                alerts.length + waiting.length + fresh.length === 1 ? "" : "s"
              } à traiter.`
        }
      />

      {/* what the last one-tap action answered, if anything */}
      <Flash ok={ok} err={err} />

      {clear && (
        <div className="k-card mb-6 px-5 py-8 text-center">
          <p className="text-[15px] font-bold text-charcoal">Tout est à jour.</p>
          <p className="mt-1.5 text-[13px] text-slate">
            Aucun café suspendu ou expiré, aucun paiement en attente, aucune demande
            d&apos;accès à rappeler.
          </p>
        </div>
      )}

      {/* ── 1. somebody has paid and is waiting ─────────────────────────
              Above the dark shops on purpose — see the header. */}
      {waiting.length > 0 && (
        <Section title={`Paiements à valider (${waiting.length})`}>
          <ul className="space-y-2">
            {waiting.map((r) => (
              <li key={r.id} className="k-card flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <Dot tone="warn" />
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/admin/cafes/${r.businessId}`}
                    className="block truncate text-[14px] font-bold text-charcoal hover:text-royal"
                  >
                    {r.name}
                  </Link>
                  <span className="k-num block truncate text-[11.5px] text-slate">
                    {tnd(r.amount)} · {findOffer(r.offer)?.label ?? r.offer} ·{" "}
                    {payMethod(r.method)?.label ?? r.method} · {ago(r.createdAt)}
                  </span>
                </span>
                {/* The receipt has to be LOOKED at before a green button, so the
                    decision itself lives on the money page next to the image
                    rather than as a one-tap approve here. */}
                <Link href="/admin/argent" className="k-btn k-btn--sm">
                  Voir le reçu
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── 2. shops that are dark, or about to be ──────────────────── */}
      {alerts.length > 0 && (
        <Section title={`Cafés à traiter (${alerts.length})`}>
          <ul className="space-y-2">
            {alerts.map(({ row, kind }) => (
              <AlertRow key={row.id} row={row} kind={kind} />
            ))}
          </ul>
        </Section>
      )}

      {/* ── 3. shops that are not customers yet ─────────────────────── */}
      {fresh.length > 0 && (
        <Section
          title={`Accès anticipé à rappeler (${fresh.length})`}
          aside={<Link href="/admin/leads" className="text-royal">tout voir →</Link>}
        >
          <ul className="space-y-2">
            {fresh.slice(0, 5).map((l) => {
              const kind = businessType(l.type);
              return (
                <li key={l.id} className="k-card flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <Dot tone="warn" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold text-charcoal">
                      <span aria-hidden>{kind.emoji}</span> {l.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-slate">
                      {kind.label} · {ago(l.createdAt)}
                    </span>
                  </span>
                  {/* The whole lead exists to produce this tap. */}
                  <a
                    href={whatsappLink(l.phone)}
                    target="_blank"
                    rel="noopener"
                    dir="ltr"
                    className="k-btn k-btn--sm k-btn--ok"
                  >
                    {prettyPhone(l.phone)}
                  </a>
                </li>
              );
            })}
          </ul>
          {fresh.length > 5 && (
            <p className="mt-2 text-[12px] text-slate">
              et {fresh.length - 5} autre{fresh.length - 5 === 1 ? "" : "s"} sur{" "}
              <Link href="/admin/leads" className="font-semibold text-royal">
                la page accès anticipé
              </Link>
              .
            </p>
          )}
        </Section>
      )}

      {/* ── the pulse ────────────────────────────────────────────────────
              LAST, and small. These four are context, not work: they change
              slowly, nobody acts on them, and at the top of the page they were
              the first thing read every morning by an operator looking for
              something to do. */}
      <Section title="La plateforme">
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Stat
            label="Cafés"
            value={stats.cafes}
            sub={`${stats.live} en ligne`}
            tone={stats.live < stats.cafes ? "warn" : undefined}
          />
          <Stat label="Clients" value={stats.diners.toLocaleString("fr-FR")} sub="cartes créées" />
          <Stat
            label="Points émis"
            value={stats.pointsIssued.toLocaleString("fr-FR")}
            sub="depuis le début"
          />
          <Stat
            label="Dernière activité"
            value={
              <span className="text-[15px]">
                {ago(
                  rows.reduce<string | null>(
                    (best, r) =>
                      r.lastActivity && (!best || r.lastActivity > best) ? r.lastActivity : best,
                    null,
                  ),
                )}
              </span>
            }
            sub="un point crédité quelque part"
          />
        </div>
      </Section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */

type Kind = "suspended" | "expired" | "soon";

/**
 * One café that needs a decision, with the decision attached.
 *
 * The two renew buttons are the whole point: extending by six months or a year
 * is what an operator does nearly every time, and before the queue existed it
 * cost a modal, a plan select, an amount and a unit. Anything unusual is one
 * tap away on the shop's own page, which is a real page now.
 */
function AlertRow({
  row,
  kind,
}: {
  row: AdminCafe & { left: ReturnType<typeof remaining> };
  kind: Kind;
}) {
  const { tone } = shopTone(row);
  const why =
    kind === "suspended"
      ? `Suspendu — ${row.suspendedReason || "sans raison"}`
      : kind === "expired"
        ? `Abonnement expiré ${row.planExpiresAt ? `le ${day(row.planExpiresAt)}` : ""} — accès coupé`
        : `Expire dans ${row.left.label}`;

  return (
    <li className="k-card flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <Dot tone={tone} />

      <span className="min-w-0 flex-1">
        <Link
          href={`/admin/cafes/${row.id}`}
          className="block truncate text-[14px] font-bold text-charcoal hover:text-royal"
        >
          {row.name}
        </Link>
        <span
          className={`block truncate text-[11.5px] ${
            kind === "soon" ? "text-[#8a5a00]" : "text-[#b3202f]"
          }`}
        >
          {why}
        </span>
      </span>

      <span className="k-num hidden shrink-0 text-[11px] text-slate/60 sm:block">/{row.slug}</span>

      {kind === "suspended" ? (
        <form action={quickUnsuspendAction} className="shrink-0">
          <input type="hidden" name="businessId" value={row.id} />
          <input type="hidden" name="suspend" value="0" />
          <button type="submit" className="k-btn k-btn--sm k-btn--ghost">
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
      <button type="submit" className="k-btn k-btn--sm k-btn--ghost">
        {label}
      </button>
    </form>
  );
}
