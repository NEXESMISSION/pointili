import Link from "next/link";
import { redirect } from "next/navigation";
import { ownerCafe, ownerHome } from "@/lib/auth/owner";
import { guardArea } from "@/lib/auth/staff";
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

  /* Roles: a cashier does not open this one. Enforced here AND in every action
     behind it — a server action is a public endpoint (lib/auth/staff). */
  await guardArea(cafe.id, "clients");

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
        <h1 className="text-[24px] font-extrabold leading-tight text-charcoal">Vos clients</h1>
        <p className="mt-0.5 text-[13px] text-slate">Qui revient, et qui ne revient plus.</p>
      </div>

      {s.customers === 0 ? (
        <Empty cards={cardCount} />
      ) : (
        <>
          {/* the one control on the page — it governs the money strip only */}
          <nav className="grid grid-cols-3 gap-1 rounded-2xl bg-[var(--o-inset)] p-1">
            {RANGES.map((r) => (
              <Link
                key={r.slug}
                href={`/owner/clients?p=${r.slug}`}
                scroll={false}
                className={`rounded-xl py-2.5 text-center text-[13px] font-bold transition ${
                  r.slug === picked.slug ? "bg-[#5b3fd1] text-white shadow-lg" : "text-slate"
                }`}
              >
                {r.label}
              </Link>
            ))}
          </nav>

          {/*
            ── A DASHBOARD ON A LAPTOP, A COLUMN ON A PHONE ────────────────
            These were four full-width strips down a 980px page: the money
            card carried a sparse chart and three numbers strung across a
            metre of white, and the loyalty verdict was ONE SENTENCE in a box
            as wide as the screen. Read at arm's length that is not a report,
            it is a list of boxes.

            At lg the money keeps two thirds — it is the chart, it needs the
            width — and the verdict takes the last third beside it, where a
            single sentence is the right size for the space it is in. The two
            people-lists keep their own row underneath, which is where an
            owner's eye goes second.
          */}
          <div className="grid gap-3 lg:grid-cols-3 lg:items-start">
            <div className="lg:col-span-2">
              <Period s={s} label={picked.label} />
            </div>
            <Verdict s={s} />
          </div>

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
          <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-slate">
            {s.range === 0 ? "Depuis le début" : label}
          </p>
          <p className="mt-1 font-display text-[44px] font-extrabold leading-[0.9] tabular-nums text-[#5b3fd1]">
            {Math.round(w.revenue)}
            <span className="ml-1.5 align-middle text-[15px] font-bold text-slate">TND</span>
          </p>
          {/* ticket moyen, which used to need a card of its own */}
          {s.avgTicketTnd > 0 && (
            <p className="mt-1 text-[12px] font-medium text-slate">
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
                  ? "bg-[#5b3fd1]"
                  : "bg-[#5b3fd1]/45"
                : "bg-[var(--o-inset)]"
            }`}
            style={{ height: `${Math.max(4, (b.revenue / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-medium text-slate">
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

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--o-edge)] pt-3.5">
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
      <p className="font-display text-[24px] font-extrabold leading-none tabular-nums text-charcoal">
        {now}
      </p>
      <p className="mt-0.5 text-[12px] font-semibold leading-tight text-slate">{label}</p>
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
      <span className={`mt-1 block font-bold text-[#2f9e6e] ${small ? "text-[12px]" : "text-[12px]"}`}>
        nouveau
      </span>
    );
  }
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0)
    return (
      <span className={`mt-1 block font-bold text-slate ${small ? "text-[12px]" : "text-[12px]"}`}>
        = stable
      </span>
    );
  const up = pct > 0;
  return (
    <span
      className={`mt-1 block font-bold ${up ? "text-[#2f9e6e]" : "text-[#e5484d]"} ${
        small ? "text-[12px]" : "whitespace-nowrap rounded-full bg-[var(--o-inset)] px-2.5 py-1 text-[12px]"
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
  const num = { good: "text-[#2f9e6e]", ok: "text-[#a06e00]", bad: "text-[#e5484d]", early: "text-slate" }[tone];

  return (
    <section className="a-card p-5">
      {/* labelled all-time so it is never read as "this week" */}
      <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-slate">
        Fidélité · depuis le début
      </p>

      {s.confident ? (
        <div className="mt-1.5 flex items-end gap-3">
          <p className={`font-display text-[44px] font-extrabold leading-[0.9] tabular-nums ${num}`}>
            {s.repeatRate}%
          </p>
          <p className="pb-1 text-[13px] font-semibold leading-snug text-slate">
            reviennent
            <br />
            <span className="text-slate">
              {s.repeatCustomers} sur {s.customers}
            </span>
          </p>
        </div>
      ) : (
        <p className="mt-1.5 font-display text-[20px] font-extrabold text-charcoal">{headline}</p>
      )}

      <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate">
        {s.confident && <b className="font-extrabold text-charcoal">{headline}. </b>}
        {advice}
      </p>

      {/*
        The favourite reward, which used to be a whole card to say one thing.
      */}
      {s.topRewards.length > 0 && (
        <p className="mt-3 border-t border-[var(--o-edge)] pt-3 text-[13px] text-slate">
          Leur préférée :{" "}
          <b className="font-extrabold text-[#5b3fd1]">{s.topRewards[0].label}</b>, servie{" "}
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
      <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-slate">
        Vos habitués
      </p>

      {s.regulars.length === 0 ? (
        <p className="mt-2 text-[13px] leading-relaxed text-slate">
          Personne n&apos;est encore venu deux fois. Dès qu&apos;un client revient,
          il apparaît ici.
        </p>
      ) : (
        <>
          <p className="mt-0.5 text-[12px] text-slate">
            Ceux à reconnaître quand ils passent la porte.
          </p>
          <ul className="mt-3 space-y-2.5">
            {s.regulars.map((p) => (
              <li key={p.phone} className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#5b3fd1] text-[15px] font-extrabold text-white">
                  {initial(p)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-charcoal">{who(p)}</span>
                  <span className="block text-[12px] text-slate">
                    {p.rhythm !== null && `${rhythmLabel(p.rhythm)} · `}
                    vu {ago(p.daysSince)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[15px] font-extrabold tabular-nums text-charcoal">
                    {p.visits}
                  </span>
                  <span className="block text-[10px] font-semibold text-slate">visites</span>
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
      <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-slate">
        Ils ne sont pas revenus
      </p>

      {s.lapsed.length === 0 ? (
        <p className="mt-2 text-[13px] leading-relaxed text-[#2f9e6e]">
          Personne ne manque à l&apos;appel — tous vos habitués sont passés
          récemment.
        </p>
      ) : (
        <>
          <p className="mt-0.5 text-[12px] text-slate">
            En retard sur leur propre habitude. Un mot, un café offert, et ils
            reviennent.
          </p>
          <ul className="mt-3 space-y-2.5">
            {s.lapsed.map((p) => (
              <li key={p.phone} className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--o-inset)] text-[15px] font-extrabold text-slate">
                  {initial(p)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-charcoal">{who(p)}</span>
                  <span className="block text-[12px] text-slate">
                    venait {p.rhythm !== null ? rhythmLabel(p.rhythm) : "régulièrement"} ·{" "}
                    {p.visits} visites
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[15px] font-extrabold tabular-nums text-[#e5484d]">
                    {p.daysSince} j
                  </span>
                  <span className="block text-[10px] font-semibold text-slate">sans lui</span>
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
    /*
      THE FIRST-DAY SCREEN, WHICH IS WHAT THIS ACTUALLY IS.

      It said "posez votre QR sur les tables" — the right instruction, with no
      way to do it: no button, no QR, and then six hundred pixels of empty
      gradient underneath. A brand-new owner opens the second tab in their new
      app and finds a sentence telling them to go and find something else.

      So the empty state is the three steps of the first day, in order, with the
      only thing they can act on right now as the button. It costs nothing once
      the shop has data — the whole block is replaced by the real figures the
      moment one card exists.
    */
    const steps = [
      ["Posez votre QR", "Sur les tables, au comptoir, sur la vitrine."],
      ["Le client scanne", "Sa carte se crée en dix secondes, sans application."],
      ["Créditez en caisse", "Son achat, ses points — et il revient pour les dépenser."],
    ];

    return (
      <section className="a-card p-5">
        <p className="text-[17px] font-extrabold text-charcoal">Votre première carte</p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate">
          Rien à mesurer tant que personne n&apos;a de carte. Voilà comment la
          première arrive.
        </p>

        <ol className="mt-4 space-y-3">
          {steps.map(([title, hint], i) => (
            <li key={title} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#5b3fd1] text-[12.5px] font-bold text-white">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-bold leading-snug text-charcoal">{title}</span>
                <span className="block text-[12px] leading-snug text-slate">{hint}</span>
              </span>
            </li>
          ))}
        </ol>

        <Link
          href="/owner/qr"
          className="mt-5 flex min-h-[52px] items-center justify-center rounded-2xl bg-[#5b3fd1] text-[14px] font-bold text-white transition active:scale-[0.99]"
        >
          Voir mon QR
        </Link>
      </section>
    );
  }

  return (
    <section className="a-card p-6 text-center">
      <p className="text-[30px]">✦</p>
      <p className="mt-2 text-[17px] font-extrabold text-charcoal">
        {cards} carte{cards > 1 ? "s" : ""} — aucun passage en caisse
      </p>
      <p className="mx-auto mt-1.5 max-w-[32ch] text-[13px] leading-relaxed text-slate">
        Votre QR marche : {cards === 1 ? "une personne a" : `${cards} personnes ont`} déjà
        pris {cards === 1 ? "sa" : "leur"} carte. Cette page compte les passages,
        pas les inscriptions — créditez un achat en caisse et les chiffres
        démarrent.
      </p>
      <Link
        href="/owner"
        className="mt-4 inline-flex rounded-full bg-[#5b3fd1] px-5 py-2.5 text-[13px] font-bold text-white"
      >
        Aller à la caisse
      </Link>
    </section>
  );
}
