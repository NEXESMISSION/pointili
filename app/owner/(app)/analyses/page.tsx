import { redirect } from "next/navigation";
import { ownerCafe } from "@/lib/auth/owner";
import { getStats, MIN_SAMPLE, type Stats } from "@/lib/stats";

export const metadata = { title: "Analyses" };

/**
 * Analyses — one question, answered in plain French: are they coming back?
 *
 * Rebuilt from a wall of figures into a short story: the verdict first (with
 * what to DO about it), then the three numbers that matter, then the month.
 * Everything else is secondary and sits at the bottom, deliberately quiet —
 * an owner glancing at this between two coffees should get the answer in two
 * seconds without reading a single table.
 */
export default async function Analytics() {
  const cafe = await ownerCafe();
  if (!cafe) redirect("/owner/nouveau");
  const s = await getStats(cafe.id);

  return (
    <div className="space-y-3.5">
      <div className="px-1">
        <h1 className="text-[24px] font-extrabold text-charcoal">Analyses</h1>
        <p className="mt-0.5 text-[13px] text-slate">Est-ce que vos clients reviennent ?</p>
      </div>

      {s.customers === 0 ? <Empty /> : <Verdict s={s} />}

      {s.customers > 0 && (
        <>
          <ThreeNumbers s={s} />
          <Month s={s} />
          <Money s={s} />
          {s.topRewards.length > 0 && <Favourites s={s} />}
          <Owed s={s} />
        </>
      )}
    </div>
  );
}

/* ── the verdict ─────────────────────────────────────────────────────── */

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
  const num = { good: "text-ok", ok: "text-gold-deep", bad: "text-seal", early: "text-slate" }[tone];
  const chip = {
    good: "bg-ok/10 text-ok",
    ok: "bg-gold-soft text-gold-deep",
    bad: "bg-seal-soft text-seal",
    early: "bg-lilac-2 text-slate",
  }[tone];

  return (
    <section className="o-card p-5">
      {s.confident ? (
        <>
          <p className={`font-display text-[62px] font-extrabold leading-[0.9] tabular-nums ${num}`}>
            {s.repeatRate}%
          </p>
          <p className="mt-1.5 text-[14px] font-bold text-charcoal">
            de vos clients sont revenus au moins une fois
          </p>
          <p className="mt-0.5 text-[12px] text-slate">
            {s.repeatCustomers} sur {s.customers} clients
          </p>
        </>
      ) : (
        <p className="font-display text-[26px] font-extrabold text-charcoal">{headline}</p>
      )}

      <div className={`mt-4 rounded-2xl px-4 py-3 ${chip}`}>
        {s.confident && <p className="text-[13.5px] font-extrabold">{headline}</p>}
        <p className="text-[13px] font-medium leading-relaxed">{advice}</p>
      </div>
    </section>
  );
}

/* ── the three numbers that actually matter ──────────────────────────── */

function ThreeNumbers({ s }: { s: Stats }) {
  const gap =
    s.medianDaysBetween === null
      ? "—"
      : s.medianDaysBetween < 1
        ? "< 1 j"
        : `${Math.round(s.medianDaysBetween)} j`;

  return (
    <div className="grid grid-cols-3 gap-2.5">
      <Stat value={String(s.customers)} label="clients" />
      <Stat value={String(s.visitsPerCustomer)} label="visites / client" />
      <Stat value={gap} label="entre 2 visites" />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="o-card px-2 py-3.5 text-center">
      <p className="font-display text-[24px] font-extrabold leading-none tabular-nums text-charcoal">
        {value}
      </p>
      <p className="mt-1 text-[10.5px] font-semibold leading-tight text-slate">{label}</p>
    </div>
  );
}

/* ── the month ───────────────────────────────────────────────────────── */

function Month({ s }: { s: Stats }) {
  const max = Math.max(1, ...s.daily.map((d) => d.revenue));
  const visits = s.daily.reduce((n, d) => n + d.visits, 0);

  return (
    <section className="o-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[13.5px] font-extrabold text-charcoal">30 derniers jours</h2>
        <span className="text-[11.5px] font-semibold text-slate">{visits} visites</span>
      </div>

      <div className="mt-3 flex h-[70px] items-end gap-[3px]">
        {s.daily.map((d, i) => (
          <span
            key={d.day}
            title={`${d.day} · ${d.visits} visite(s)`}
            className={`flex-1 rounded-t-[3px] ${
              d.revenue
                ? i === s.daily.length - 1
                  ? "bg-royal"
                  : "bg-royal/45"
                : "bg-hair"
            }`}
            style={{ height: `${Math.max(4, (d.revenue / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-medium text-slate/70">
        <span>il y a 30 j</span>
        <span>aujourd&apos;hui</span>
      </div>
    </section>
  );
}

/* ── money ───────────────────────────────────────────────────────────── */

function Money({ s }: { s: Stats }) {
  return (
    <section className="o-card p-5">
      <h2 className="text-[13.5px] font-extrabold text-charcoal">L&apos;argent</h2>
      <p className="mt-0.5 text-[11.5px] leading-snug text-slate">
        Uniquement ce qui est passé par la caisse Pointili.
      </p>

      <div className="mt-3.5 flex items-end justify-between gap-3">
        <span>
          <span className="block font-display text-[30px] font-extrabold leading-none tabular-nums text-royal">
            {Math.round(s.revenueTnd)}
          </span>
          <span className="text-[11px] font-semibold text-slate">TND encaissés</span>
        </span>
        <span className="text-right">
          <span className="block font-display text-[22px] font-extrabold leading-none tabular-nums text-ok">
            {Math.round(s.netTnd)}
          </span>
          <span className="text-[11px] font-semibold text-slate">net</span>
        </span>
      </div>

      <div className="mt-3.5 space-y-1.5 border-t border-hair pt-3">
        <Line label="Ticket moyen" value={`${s.avgTicketTnd.toFixed(2)} TND`} />
        <Line label="Ces 30 jours" value={`${s.revenue30d.toFixed(0)} TND`} />
        <Line label="Coût des récompenses" value={`− ${s.rewardCostTnd.toFixed(0)} TND`} />
      </div>
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] text-slate">{label}</span>
      <span className="shrink-0 text-[12.5px] font-bold tabular-nums text-charcoal">{value}</span>
    </div>
  );
}

/* ── what they like / what you owe ───────────────────────────────────── */

function Favourites({ s }: { s: Stats }) {
  const top = s.topRewards[0];
  return (
    <section className="o-card p-5">
      <h2 className="text-[13.5px] font-extrabold text-charcoal">Ce qu&apos;ils préfèrent</h2>
      <p className="mt-2 text-[15px] font-extrabold text-royal">{top.label}</p>
      <p className="text-[11.5px] text-slate">
        servi {top.claimed} fois
        {s.topRewards.length > 1 && ` · puis ${s.topRewards[1].label}`}
      </p>
    </section>
  );
}

function Owed({ s }: { s: Stats }) {
  return (
    <section className="o-card p-5">
      <h2 className="text-[13.5px] font-extrabold text-charcoal">Ce que vous devez encore</h2>
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
    <section className="o-card px-5 py-12 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-lilac text-[26px]">📊</span>
      <p className="mt-4 text-[16px] font-extrabold text-charcoal">Pas encore de données</p>
      <p className="mx-auto mt-1.5 max-w-[32ch] text-[13px] leading-relaxed text-slate">
        Créditez votre premier client depuis la <b className="text-charcoal">Caisse</b>. Dès
        qu&apos;un client revient, vous saurez ici si la fidélité fonctionne.
      </p>
    </section>
  );
}
