import Link from "next/link";
import { notFound } from "next/navigation";
import { dinerDetail } from "@/lib/platform";
import { prettyPhone, whatsappLink } from "@/lib/early";
import { ago, day, Empty, PageHead, Pill, Section, stamp, Stat } from "../../ui";
import { DinerControls } from "./DinerControls";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await dinerDetail(id);
  return { title: d?.person.name || d?.person.code || "Client" };
}

const LEDGER_LABEL: Record<string, string> = {
  earn: "Achat",
  welcome: "Bienvenue",
  redeem: "Récompense",
  adjust: "Correction",
};

/**
 * ONE PERSON, EVERYWHERE THEY HOLD A CARD.
 *
 * The shape of this page is the shape of the conversation it exists to support.
 * Somebody writes in; the operator needs, in this order: is this the right
 * person, can I reach them, what do they hold, what happened to it, and what
 * can I do about it.
 *
 * ── THE HISTORY CROSSES SHOPS ─────────────────────────────────────────────
 *
 * A customer does not know which café's fault it was — they know they had
 * points on Tuesday and do not now. So the ledger here is not per-shop: it is
 * everything that happened to this person, in order, with the shop named on
 * each line. That single list answers "where did they go?" in one read, and it
 * is a view no other screen in the product can produce — an owner sees only
 * their own café, and the customer's own history is per-card too.
 *
 * ── THE NUMBER IS SHOWN IN FULL, AND ONLY HERE ────────────────────────────
 *
 * The shop page masks customer numbers because it is browsing: one shop, many
 * customers, none of whom asked for anything. This record was opened
 * deliberately, about a person already talking to us, and an operator who
 * cannot read the number back cannot verify who they are or call them. The
 * search results that lead here stay masked.
 */
export default async function DinerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await dinerDetail(id);
  if (!d) notFound();

  const { person, totals } = d;
  const locked = person.lockedFor > 0;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead
        back={{ href: "/admin/clients", label: "Clients" }}
        title={person.name || "Client sans prénom"}
        context={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="k-num rounded bg-[var(--o-inset)] px-1.5 py-0.5 text-[11px] font-bold text-royal">
              {person.code}
            </span>
            <span className="k-num" dir="ltr">
              {prettyPhone(person.phone)}
            </span>
            <span className="text-slate/40">·</span>
            <span>client depuis {day(person.createdAt)}</span>
            {locked && (
              <Pill tone="bad">
                bloqué {Math.ceil(person.lockedFor / 60)} min
              </Pill>
            )}
          </span>
        }
      >
        {/* The operator is almost always about to answer this person. */}
        <a
          href={whatsappLink(person.phone)}
          target="_blank"
          rel="noopener"
          className="k-btn k-btn--sm k-btn--ok"
        >
          WhatsApp ↗
        </a>
      </PageHead>

      {/*
        THE LOCKOUT, SAID FIRST WHEN IT APPLIES. "Je n'arrive pas à me
        connecter" is answered by this one fact about half the time, and it is
        invisible everywhere else in the product — the diner's own screen says
        only "code incorrect".
      */}
      {locked && (
        <p className="k-note k-bad mb-5 w-full  px-4 py-3">
          Trop de codes faux : la connexion est bloquée encore{" "}
          {Math.ceil(person.lockedFor / 60)} minutes. Réinitialiser le code lève le
          blocage immédiatement.
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat label="Cartes" value={totals.shops} sub="commerces où il a un solde" />
        <Stat
          label="Points en main"
          value={Math.round(totals.held).toLocaleString("fr-FR")}
          sub="tous commerces confondus"
        />
        <Stat label="Cumulés" value={Math.round(totals.earned).toLocaleString("fr-FR")} sub="depuis le début" />
        <Stat label="Dépensés" value={Math.round(totals.spent).toLocaleString("fr-FR")} sub="en récompenses" />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="order-1 lg:order-2 lg:col-span-5">
          <Section title="Agir">
            <DinerControls
              publicId={person.publicId}
              cards={d.cards.map((c) => ({ id: c.businessId, name: c.name }))}
            />
          </Section>
        </div>

        <div className="order-2 lg:order-1 lg:col-span-7">
          <Section title="Ses cartes" aside={`${d.cards.length}`}>
            {d.cards.length === 0 ? (
              <Empty>
                Ce compte existe mais n&apos;a de carte nulle part — il s&apos;est inscrit
                sans jamais passer chez un commerce.
              </Empty>
            ) : (
              <ul className="k-card divide-y divide-[var(--o-edge)]">
                {d.cards.map((c) => (
                  <li key={c.businessId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                    <span className={`k-dot k-${c.live ? "ok" : "bad"}`} title={c.live ? "en ligne" : "hors ligne"} aria-hidden />
                    <Link
                      href={`/admin/cafes/${c.businessId}`}
                      className="min-w-0 flex-1 truncate text-[13px] font-bold text-charcoal hover:text-royal"
                    >
                      {c.name}
                    </Link>
                    <span className="k-num shrink-0 text-[13px] font-bold text-royal">
                      {Math.round(c.balance)} pts
                    </span>
                    <span className="w-full text-[11px] text-slate">
                      carte depuis {day(c.since)} · ouverte {ago(c.lastOpened)}
                      {c.code && <span className="k-num"> · code {c.code}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Son historique" aside="tous commerces">
            {d.ledger.length === 0 ? (
              <Empty>Aucune opération. Ce compte n&apos;a jamais rien gagné ni dépensé.</Empty>
            ) : (
              <ul className="k-card divide-y divide-[var(--o-edge)]">
                {d.ledger.map((l, i) => (
                  <li key={i} className="flex items-baseline gap-3 px-4 py-2 text-[12px]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-charcoal">
                        {l.shop ?? "café supprimé"}
                      </span>
                      <span className="block text-[11px] text-slate">
                        {LEDGER_LABEL[l.reason] ?? l.reason}
                        {l.tnd ? <span className="k-num"> · {l.tnd} TND</span> : null}
                      </span>
                    </span>
                    <span
                      className={`k-num shrink-0 font-bold ${
                        l.delta >= 0 ? "text-[#1f7a52]" : "text-[#b3202f]"
                      }`}
                    >
                      {l.delta > 0 ? "+" : ""}
                      {l.delta}
                    </span>
                    <span className="hidden w-[104px] shrink-0 whitespace-nowrap text-end text-[11px] text-slate/70 sm:block">
                      {stamp(l.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <p className="mt-8 text-[11px] leading-relaxed text-slate/70">
        Identifiant <span className="k-num">{person.publicId}</span>. Toute correction de
        points apparaît dans cet historique et dans celui du commerce — une correction
        qui se cache est pire que l&apos;erreur qu&apos;elle répare.
      </p>
    </div>
  );
}
