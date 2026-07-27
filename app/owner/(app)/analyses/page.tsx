import Link from "next/link";
import { redirect } from "next/navigation";
import { ownerCafe } from "@/lib/auth/owner";
import { getStats, MIN_SAMPLE, type Range, type Stats } from "@/lib/stats";

export const metadata = { title: "Analyses" };

/**
 * Analyses — a dashboard, not a report.
 *
 * The old page was a fixed pile of all-time totals: no way to ask "how was this
 * week?", and no number had anything to compare itself against. A total with no
 * period and no baseline can't be acted on — 248 TND is good or bad only next to
 * the 210 before it.
 *
 * So the page has ONE control, a period, and every figure inside the top card
 * obeys it and carries its change against the previous, equally long stretch.
 * Retention sits below and is explicitly all-time, because judging whether
 * people come back needs more history than a week.
 *
 * The period lives in the URL, so it survives a refresh and the back button.
 */

const RANGES: { key: Range; label: string; slug: string }[] = [
  { key: 7, label: "7 jours", slug: "7" },
  { key: 30, label: "30 jours", slug: "30" },
  { key: 0, label: "Tout", slug: "tout" },
];

export default async function Analytics({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const cafe = await ownerCafe();
  if (!cafe) redirect("/owner/nouveau");

  const { p } = await searchParams;
  const picked = RANGES.find((r) => r.slug === p) ?? RANGES[1];
  const s = await getStats(cafe.id, picked.key);

  return (
    <div className="space-y-3.5">
      <div className="px-1">
        <h1 className="text-[24px] font-extrabold text-white">Analyses</h1>
        <p className="mt-0.5 text-[13px] text-white/55">Est-ce que vos clients reviennent ?</p>
      </div>

      {/* the one control on the page */}
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

      {s.customers === 0 ? (
        <Empty />
      ) : (
        <>
          <Period s={s} label={picked.label} />
          <Retention s={s} />
          <Money s={s} />
          {s.topRewards.length > 0 && <Favourites s={s} />}
          <Owed s={s} />
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  THE PERIOD — everything here obeys the picker                          */
/* ══════════════════════════════════════════════════════════════════════ */

function Period({ s, label }: { s: Stats; label: string }) {
  const max = Math.max(1, ...s.series.map((b) => b.revenue));
  const w = s.window;

  return (
    <section className="a-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/45">
            {s.range === 0 ? "Depuis le début" : label}
          </p>
          <p className="mt-1 font-display text-[46px] font-extrabold leading-[0.9] tabular-nums text-[#b9a3ff]">
            {Math.round(w.revenue)}
            <span className="ml-1.5 align-middle text-[15px] font-bold text-white/45">TND</span>
          </p>
        </div>
        <Delta now={w.revenue} before={s.previous?.revenue} />
      </div>

      {/* the shape of the period */}
      <div className="mt-4 flex h-[74px] items-end gap-[3px]">
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

      {/* the same period, three other ways */}
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
      <p className="mt-0.5 text-[10.5px] font-semibold leading-tight text-white/50">{label}</p>
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
      <span className={`mt-1 block font-bold text-[#7ff0b0] ${small ? "text-[10.5px]" : "text-[12px]"}`}>
        nouveau
      </span>
    );
  }
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0)
    return (
      <span className={`mt-1 block font-bold text-white/40 ${small ? "text-[10.5px]" : "text-[12px]"}`}>
        = stable
      </span>
    );
  const up = pct > 0;
  return (
    <span
      className={`mt-1 block font-bold ${up ? "text-[#7ff0b0]" : "text-[#ff9a9a]"} ${
        small ? "text-[10.5px]" : "whitespace-nowrap rounded-full bg-white/[0.08] px-2.5 py-1 text-[12px]"
      }`}
    >
      {up ? "▲" : "▼"} {up ? "+" : "−"}
      {Math.abs(pct)}%
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  RETENTION — all-time on purpose                                       */
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

function Retention({ s }: { s: Stats }) {
  const { tone, headline, advice } = verdict(s);
  const num = { good: "text-[#7ff0b0]", ok: "text-[#ffd27a]", bad: "text-[#ff9a9a]", early: "text-white/55" }[tone];
  const chip = {
    good: "bg-ok/10 text-[#7ff0b0]",
    ok: "bg-[#ffd27a]/12 text-[#ffd27a]",
    bad: "bg-[#ff6b6b]/12 text-[#ff9a9a]",
    early: "bg-white/[0.08] text-white/55",
  }[tone];

  const gap =
    s.medianDaysBetween === null
      ? "—"
      : s.medianDaysBetween < 1
        ? "< 1 j"
        : `${Math.round(s.medianDaysBetween)} j`;

  return (
    <section className="a-card p-5">
      {/* labelled all-time so it is never read as "this week" */}
      <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/45">
        Fidélité · depuis le début
      </p>

      {s.confident ? (
        <div className="mt-1 flex items-end gap-3">
          <p className={`font-display text-[52px] font-extrabold leading-[0.9] tabular-nums ${num}`}>
            {s.repeatRate}%
          </p>
          <p className="pb-1.5 text-[12.5px] font-semibold leading-snug text-white/60">
            reviennent
            <br />
            <span className="text-white/45">
              {s.repeatCustomers} sur {s.customers}
            </span>
          </p>
        </div>
      ) : (
        <p className="mt-1 font-display text-[24px] font-extrabold text-white">{headline}</p>
      )}

      <div className={`mt-3.5 rounded-2xl px-4 py-3 ${chip}`}>
        {s.confident && <p className="text-[13.5px] font-extrabold">{headline}</p>}
        <p className="text-[13px] font-medium leading-relaxed">{advice}</p>
      </div>

      <div className="mt-3.5 space-y-1.5 border-t border-white/12 pt-3">
        <Line label="Clients au total" value={String(s.customers)} />
        <Line label="Visites par client" value={String(s.visitsPerCustomer)} />
        <Line label="Entre deux visites" value={gap} />
      </div>
    </section>
  );
}

/* ── money, all-time ─────────────────────────────────────────────────── */

function Money({ s }: { s: Stats }) {
  return (
    <section className="a-card p-5">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/45">
        L&apos;argent · depuis le début
      </p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <span>
          <span className="block font-display text-[28px] font-extrabold leading-none tabular-nums text-white">
            {Math.round(s.revenueTnd)}
          </span>
          <span className="text-[11px] font-semibold text-white/50">TND encaissés</span>
        </span>
        <span className="text-right">
          <span className="block font-display text-[22px] font-extrabold leading-none tabular-nums text-[#7ff0b0]">
            {Math.round(s.netTnd)}
          </span>
          <span className="text-[11px] font-semibold text-white/50">net</span>
        </span>
      </div>

      <div className="mt-3.5 space-y-1.5 border-t border-white/12 pt-3">
        <Line label="Ticket moyen" value={`${s.avgTicketTnd.toFixed(2)} TND`} />
        <Line label="Coût des récompenses" value={`− ${s.rewardCostTnd.toFixed(0)} TND`} />
      </div>
      <p className="mt-2.5 text-[11px] leading-snug text-white/40">
        Uniquement ce qui est passé par la caisse Pointili.
      </p>
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] text-white/55">{label}</span>
      <span className="shrink-0 text-[12.5px] font-bold tabular-nums text-white">{value}</span>
    </div>
  );
}

/* ── what they like / what you owe ───────────────────────────────────── */

function Favourites({ s }: { s: Stats }) {
  const top = s.topRewards[0];
  return (
    <section className="a-card p-5">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/45">
        Ce qu&apos;ils préfèrent
      </p>
      <p className="mt-2 text-[15px] font-extrabold text-[#b9a3ff]">{top.label}</p>
      <p className="text-[11.5px] text-white/55">
        servi {top.claimed} fois
        {s.topRewards.length > 1 && ` · puis ${s.topRewards[1].label}`}
      </p>
    </section>
  );
}

function Owed({ s }: { s: Stats }) {
  return (
    <section className="a-card p-5">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/45">
        Ce que vous devez encore
      </p>
      <div className="mt-2.5 space-y-1.5">
        <Line
          label="Points en circulation"
          value={`${s.outstandingPoints} ≈ ${(s.outstandingPoints / s.pointsPerTnd).toFixed(0)} TND`}
        />
        <Line label="Codes en attente" value={String(s.pendingCodes)} />
      </div>
    </section>
  );
}

/* ── empty ───────────────────────────────────────────────────────────── */

function Empty() {
  return (
    <section className="a-card p-6 text-center">
      <p className="text-[36px]">✦</p>
      <p className="mt-2 text-[16px] font-extrabold text-white">Pas encore de client</p>
      <p className="mx-auto mt-1.5 max-w-[30ch] text-[13px] leading-relaxed text-white/55">
        Posez votre QR sur le comptoir. Dès la première carte, vous verrez ici
        s&apos;ils reviennent.
      </p>
    </section>
  );
}
