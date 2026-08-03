import Link from "next/link";
import { redirect } from "next/navigation";
import { ownerCafe, ownerHome } from "@/lib/auth/owner";
import { cafeCardCount } from "@/lib/db";
import { getStats, MIN_SAMPLE, type Person, type Range, type Stats } from "@/lib/stats";
import { BackLink } from "@/components/BackLink";

export const metadata = { title: "Vos clients" };

/**
 * Vos clients — people, not totals.
 *
 * This page used to be five cards of arithmetic: revenue, a repeat rate, ticket
 * moyen, points en circulation, codes émis. All of it correct, and none of it
 * anything an owner could DO something about on a Tuesday afternoon. You cannot
 * act on "27,5 points en circulation".
 *
 * The product's promise is fidélité, so the page is now the two questions that
 * word actually means, and both of them are answered with names:
 *
 *   Vos habitués          — who to recognise across the counter.
 *   Ils ne sont pas revenus — who is quietly leaving, while there is still time.
 *
 * The money stays, compressed into one strip at the top, because it is the
 * number an owner checks before deciding to renew. The accounting trivia is
 * gone: points in circulation and pending codes were never decisions, and both
 * were read as debts (see the notes they used to carry).
 *
 * The period lives in the URL, so it survives a refresh and the back button.
 */

const RANGES: { key: Range; label: string; slug: string }[] = [
  { key: 7, label: "7 jours", slug: "7" },
  { key: 30, label: "30 jours", slug: "30" },
  { key: 0, label: "Tout", slug: "tout" },
];

export default async function Clients({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const cafe = await ownerCafe();
  if (!cafe) redirect(await ownerHome());

  const { p } = await searchParams;
  const picked = RANGES.find((r) => r.slug === p) ?? RANGES[1];
  /*
    Two different populations, and the empty state used to confuse them.

    `s.customers` counts people who have BOUGHT (ledger rows with reason
    'earn'). `cardCount` counts people who hold a card here. Enrolling at the
    QR writes no ledger row, so a shop whose QR works before its till does has
    cards and no purchases — the normal day one. The page then said "Pas encore
    de client" one nav tap from a Caisse screen headed "Mes clients · 1" with
    the person's name under it, and argued against its own renewal.
  */
  const [s, cardCount] = await Promise.all([
    getStats(cafe.id, picked.key),
    cafeCardCount(cafe.id),
  ]);

  return (
    /*
      The one owner screen that asks the layout for more room. Every other page
      here is a phone-shaped tool used at a counter; this one is read at a desk,
      and the two people-lists sit side by side once there is width for them.
      The layout reads [data-owner-wide] (globals.css).
    */
    <div data-owner-wide className="space-y-3">
      <div className="px-1">
        <BackLink fallback="/owner" className="md:hidden" />
        <h1 className="text-[24px] font-extrabold leading-tight text-white">Vos clients</h1>
        <p className="mt-0.5 text-[13px] text-white/55">Qui revient, et qui ne revient plus.</p>
      </div>

      {s.customers === 0 ? (
        <Empty cards={cardCount} />
      ) : (
        <>
          {/* the one control on the page — it governs the money strip only */}
          <nav className="grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.07] p-1">
            {RANGES.map((r) => (
              <Link
                key={r.slug}
                href={`/owner/analyses?p=${r.slug}`}
                scroll={false}
                className={`rounded-xl py-2.5 text-center text-[13px] font-bold transition ${
                  r.slug === picked.slug ? "bg-[#6d4ae6] text-white shadow-lg" : "text-white/55"
                }`}
              >
                {r.label}
              </Link>
            ))}
          </nav>

          <Period s={s} label={picked.label} />
          <Verdict s={s} />

          {/* the page's reason for existing */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Regulars s={s} />
            <Lapsed s={s} />
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  THE MONEY, IN ONE STRIP                                                */
/* ══════════════════════════════════════════════════════════════════════ */

function Period({ s, label }: { s: Stats; label: string }) {
  const max = Math.max(1, ...s.series.map((b) => b.revenue));
  const w = s.window;

  return (
    <section className="a-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/45">
            {s.range === 0 ? "Depuis le début" : label}
          </p>
          <p className="mt-1 font-display text-[44px] font-extrabold leading-[0.9] tabular-nums text-[#b9a3ff]">
            {Math.round(w.revenue)}
            <span className="ml-1.5 align-middle text-[15px] font-bold text-white/45">TND</span>
          </p>
          {/* ticket moyen, which used to need a card of its own */}
          {s.avgTicketTnd > 0 && (
            <p className="mt-1 text-[12px] font-medium text-white/45">
              {s.avgTicketTnd.toFixed(2)} TND par passage en moyenne
            </p>
          )}
        </div>
        <Delta now={w.revenue} before={s.previous?.revenue} />
      </div>

      {/* the shape of the period */}
      <div className="mt-4 flex h-[56px] items-end gap-[3px]">
        {s.series.map((b, i) => (
          <span
            key={b.at}
            title={`${new Date(b.at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} · ${b.visits} visite(s) · ${b.revenue} TND`}
            className={`flex-1 rounded-t-[3px] ${
              b.revenue
                ? i === s.series.length - 1
                  ? "bg-[#8b6bff]"
                  : "bg-[#8b6bff]/45"
                : "bg-white/[0.09]"
            }`}
            style={{ height: `${Math.max(4, (b.revenue / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-medium text-white/40">
        <span>
          {s.series.length > 0 &&
            new Date(s.series[0].at).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "short",
            })}
        </span>
        {s.bucketDays > 1 && <span>{s.bucketDays} j par barre</span>}
        <span>aujourd&apos;hui</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/12 pt-3.5">
        <Cell label="visites" now={w.visits} before={s.previous?.visits} />
        <Cell label="clients servis" now={w.activeCustomers} before={s.previous?.activeCustomers} />
        <Cell label="nouveaux" now={w.newCustomers} before={s.previous?.newCustomers} />
      </div>
    </section>
  );
}

function Cell({ label, now, before }: { label: string; now: number; before?: number }) {
  return (
    <div>
      <p className="font-display text-[24px] font-extrabold leading-none tabular-nums text-white">
        {now}
      </p>
      <p className="mt-0.5 text-[12px] font-semibold leading-tight text-white/50">{label}</p>
      <Delta now={now} before={before} small />
    </div>
  );
}

/**
 * The change against the previous stretch. Deliberately says nothing when there
 * is nothing to compare against — a made-up "+100%" against a period the shop
 * did not live through is worse than silence.
 */
function Delta({
  now,
  before,
  small = false,
}: {
  now: number;
  before?: number;
  small?: boolean;
}) {
  if (before === undefined) return null;
  if (before === 0) {
    if (now === 0) return null;
    return (
      <span className={`mt-1 block font-bold text-[#7ff0b0] ${small ? "text-[12px]" : "text-[12px]"}`}>
        nouveau
      </span>
    );
  }
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0)
    return (
      <span className={`mt-1 block font-bold text-white/40 ${small ? "text-[12px]" : "text-[12px]"}`}>
        = stable
      </span>
    );
  const up = pct > 0;
  return (
    <span
      className={`mt-1 block font-bold ${up ? "text-[#7ff0b0]" : "text-[#ff9a9a]"} ${
        small ? "text-[12px]" : "whitespace-nowrap rounded-full bg-white/[0.08] px-2.5 py-1 text-[12px]"
      }`}
    >
      {up ? "▲" : "▼"} {up ? "+" : "−"}
      {Math.abs(pct)}%
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  THE VERDICT — one sentence, all-time on purpose                        */
/* ══════════════════════════════════════════════════════════════════════ */

type Tone = "good" | "ok" | "bad" | "early";

function verdict(s: Stats): { tone: Tone; headline: string; advice: string } {
  if (!s.confident) {
    const left = MIN_SAMPLE - s.customers;
    return {
      tone: "early",
      headline: "Trop tôt pour conclure",
      advice: `${s.customers} client${s.customers > 1 ? "s" : ""} pour l'instant. Encore ${left} et ce chiffre voudra dire quelque chose.`,
    };
  }
  if (s.repeatCustomers === 0)
    return {
      tone: "bad",
      headline: "Personne n'est encore revenu",
      advice: "Votre première récompense est sûrement trop chère. Visez un cadeau atteignable en 2–3 visites.",
    };
  if (s.repeatRate >= 30)
    return {
      tone: "good",
      headline: "La fidélité fonctionne",
      advice: "Gardez le cap — et parlez de votre carte à chaque nouveau client.",
    };
  if (s.repeatRate >= 15)
    return {
      tone: "ok",
      headline: "C'est un début",
      advice: "Baissez le prix de la première récompense pour la rendre atteignable en 2–3 visites.",
    };
  return {
    tone: "bad",
    headline: "Peu de clients reviennent",
    advice: "Vos récompenses sont sans doute trop chères ou peu désirables. Rendez la première facile à atteindre.",
  };
}

function Verdict({ s }: { s: Stats }) {
  const { tone, headline, advice } = verdict(s);
  const num = { good: "text-[#7ff0b0]", ok: "text-[#ffd27a]", bad: "text-[#ff9a9a]", early: "text-white/55" }[tone];

  return (
    <section className="a-card p-5">
      {/* labelled all-time so it is never read as "this week" */}
      <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/45">
        Fidélité · depuis le début
      </p>

      {s.confident ? (
        <div className="mt-1.5 flex items-end gap-3">
          <p className={`font-display text-[44px] font-extrabold leading-[0.9] tabular-nums ${num}`}>
            {s.repeatRate}%
          </p>
          <p className="pb-1 text-[13px] font-semibold leading-snug text-white/60">
            reviennent
            <br />
            <span className="text-white/45">
              {s.repeatCustomers} sur {s.customers}
            </span>
          </p>
        </div>
      ) : (
        <p className="mt-1.5 font-display text-[20px] font-extrabold text-white">{headline}</p>
      )}

      <p className="mt-2 text-[13px] font-medium leading-relaxed text-white/60">
        {s.confident && <b className="font-extrabold text-white">{headline}. </b>}
        {advice}
      </p>

      {/*
        The favourite reward, which used to be a whole card to say one thing.
      */}
      {s.topRewards.length > 0 && (
        <p className="mt-3 border-t border-white/12 pt-3 text-[13px] text-white/55">
          Leur préférée :{" "}
          <b className="font-extrabold text-[#b9a3ff]">{s.topRewards[0].label}</b>, servie{" "}
          {s.topRewards[0].claimed} fois.
        </p>
      )}
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  THE PEOPLE                                                             */
/* ══════════════════════════════════════════════════════════════════════ */

/** The till identifies people this way; so does this page. Never the phone. */
function who(p: Person) {
  return p.name ?? p.code ?? "Client";
}

function initial(p: Person) {
  return who(p).charAt(0).toUpperCase();
}

/** Whole days, in the tense an owner would actually say out loud. */
function ago(days: number) {
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} j`;
}

function rhythmLabel(days: number) {
  if (days < 1.5) return "tous les jours";
  if (days < 10) return `tous les ${Math.round(days)} j`;
  if (days < 45) return `toutes les ${Math.round(days / 7)} sem.`;
  return `tous les ${Math.round(days / 30)} mois`;
}

function Regulars({ s }: { s: Stats }) {
  return (
    <section className="a-card p-5">
      <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/45">
        Vos habitués
      </p>

      {s.regulars.length === 0 ? (
        <p className="mt-2 text-[13px] leading-relaxed text-white/50">
          Personne n&apos;est encore venu deux fois. Dès qu&apos;un client revient,
          il apparaît ici.
        </p>
      ) : (
        <>
          <p className="mt-0.5 text-[12px] text-white/50">
            Ceux à reconnaître quand ils passent la porte.
          </p>
          <ul className="mt-3 space-y-2.5">
            {s.regulars.map((p) => (
              <li key={p.phone} className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#6d4ae6] text-[15px] font-extrabold text-white">
                  {initial(p)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-white">{who(p)}</span>
                  <span className="block text-[12px] text-white/45">
                    {p.rhythm !== null && `${rhythmLabel(p.rhythm)} · `}
                    vu {ago(p.daysSince)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[15px] font-extrabold tabular-nums text-white">
                    {p.visits}
                  </span>
                  <span className="block text-[10px] font-semibold text-white/40">visites</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * The list this whole page was missing.
 *
 * "Ils ne sont pas revenus" is measured against each person's own rhythm, not a
 * fixed number of days (see lib/stats.ts) — so it means "later than THEY
 * usually are", which is the only version of the question a shop owner ever
 * actually asks about a face they know.
 */
function Lapsed({ s }: { s: Stats }) {
  // Nothing to say before the shop has any repeat customers at all.
  if (s.regulars.length === 0 && s.lapsed.length === 0) return null;

  return (
    <section className="a-card p-5">
      <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/45">
        Ils ne sont pas revenus
      </p>

      {s.lapsed.length === 0 ? (
        <p className="mt-2 text-[13px] leading-relaxed text-[#7ff0b0]">
          Personne ne manque à l&apos;appel — tous vos habitués sont passés
          récemment.
        </p>
      ) : (
        <>
          <p className="mt-0.5 text-[12px] text-white/50">
            En retard sur leur propre habitude. Un mot, un café offert, et ils
            reviennent.
          </p>
          <ul className="mt-3 space-y-2.5">
            {s.lapsed.map((p) => (
              <li key={p.phone} className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.09] text-[15px] font-extrabold text-white/70">
                  {initial(p)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-white">{who(p)}</span>
                  <span className="block text-[12px] text-white/45">
                    venait {p.rhythm !== null ? rhythmLabel(p.rhythm) : "régulièrement"} ·{" "}
                    {p.visits} visites
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[15px] font-extrabold tabular-nums text-[#ff9a9a]">
                    {p.daysSince} j
                  </span>
                  <span className="block text-[10px] font-semibold text-white/40">sans lui</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* ── empty ───────────────────────────────────────────────────────────── */

/**
 * Two empty states, because there are two ways to be empty and they need
 * opposite things from the owner.
 *
 * No cards yet → the QR is not doing its job; go and put it on the tables.
 * Cards but no purchase → the QR IS working and the till is not; the next move
 * is at the counter, not on the wall. Saying "pas encore de client" to someone
 * whose Caisse screen names their customers reads as the software being wrong,
 * and it is the software being imprecise: here a "client" means someone who
 * has bought, and that had never been said out loud.
 */
function Empty({ cards }: { cards: number }) {
  if (cards === 0) {
    return (
      <section className="a-card p-6 text-center">
        <p className="text-[30px]">✦</p>
        <p className="mt-2 text-[17px] font-extrabold text-white">Pas encore de carte</p>
        <p className="mx-auto mt-1.5 max-w-[30ch] text-[13px] leading-relaxed text-white/55">
          Posez votre QR sur les tables. Dès la première carte, vous verrez ici
          s&apos;ils reviennent.
        </p>
      </section>
    );
  }

  return (
    <section className="a-card p-6 text-center">
      <p className="text-[30px]">✦</p>
      <p className="mt-2 text-[17px] font-extrabold text-white">
        {cards} carte{cards > 1 ? "s" : ""} — aucun passage en caisse
      </p>
      <p className="mx-auto mt-1.5 max-w-[32ch] text-[13px] leading-relaxed text-white/55">
        Votre QR marche : {cards === 1 ? "une personne a" : `${cards} personnes ont`} déjà
        pris {cards === 1 ? "sa" : "leur"} carte. Cette page compte les passages,
        pas les inscriptions — créditez un achat en caisse et les chiffres
        démarrent.
      </p>
      <Link
        href="/owner"
        className="mt-4 inline-flex rounded-full bg-[#7c3aed] px-5 py-2.5 text-[13px] font-bold text-white"
      >
        Aller à la caisse
      </Link>
    </section>
  );
}
