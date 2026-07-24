import { redirect } from "next/navigation";
import { ownerCafe } from "@/lib/auth/owner";
import { getStats, MIN_SAMPLE, type Stats } from "@/lib/stats";

export const metadata = { title: "Analyses" };

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/** "moins d'un jour" / "tous les 3 jours" — never "tous les 0 jours". */
function formatGap(days: number): string {
  if (days < 1) return "moins d'un jour";
  const d = Math.round(days);
  return d === 1 ? "chaque jour" : `tous les ${d} jours`;
}

type Tone = "good" | "ok" | "bad" | "unknown";

/**
 * The plain-French verdict — the whole point of this page. Extracted so the
 * hero can show the headline number AND the sentence that tells the owner what
 * to actually do about it.
 */
function verdict(s: Stats): { tone: Tone; text: string } {
  if (!s.confident) {
    const left = MIN_SAMPLE - s.customers;
    return {
      tone: "unknown",
      text:
        s.customers === 0
          ? "Aucun client n'est encore passé en caisse. Créditez un premier ticket pour démarrer."
          : `Trop tôt pour conclure : ${s.customers} client${s.customers > 1 ? "s" : ""} seulement. Encore ${left} pour que les chiffres veuillent dire quelque chose.`,
    };
  }
  if (s.repeatCustomers === 0) {
    return {
      tone: "bad",
      text:
        "Personne n'est encore revenu. Vos récompenses sont probablement hors de portée — visez un premier cadeau atteignable en 2–3 visites.",
    };
  }
  if (s.repeatRate >= 30) {
    return {
      tone: "good",
      text: `La fidélité fonctionne${
        s.medianDaysBetween !== null ? `, en moyenne ${formatGap(s.medianDaysBetween)}` : ""
      }. Gardez le cap.`,
    };
  }
  if (s.repeatRate >= 15) {
    return {
      tone: "ok",
      text: "C'est un début. Baissez le prix de votre première récompense pour la rendre atteignable en 2–3 visites.",
    };
  }
  return {
    tone: "bad",
    text: "Vos récompenses sont sans doute trop chères ou trop peu désirables. Visez un premier cadeau atteignable en 2–3 visites.",
  };
}

/**
 * Analytics — the page that decides whether Pointili is worth paying for.
 * It answers one question: are people coming back, and does that make money?
 */
export default async function Analytics() {
  const cafe = await ownerCafe();
  if (!cafe) redirect("/owner/nouveau");
  const s = await getStats(cafe.id);

  if (s.customers === 0) {
    return (
      <div className="space-y-4">
        <PageTitle />
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <PageTitle />

      {/* ── the one thing that matters ── */}
      <Hero s={s} />

      {/* ── does it make money? ── */}
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Chiffre d'affaires" value={`${Math.round(s.revenueTnd)}`} unit="TND" tone="royal" />
        <Tile label="Bénéfice net" value={`${Math.round(s.netTnd)}`} unit="TND" tone="ok" />
      </div>

      <Card title="Le détail">
        <Row label="Visites par client" value={`${s.visitsPerCustomer}`} help="Plus c'est haut, plus la boucle tourne." />
        <Row
          label="Délai entre deux visites"
          value={s.medianDaysBetween === null ? "—" : formatGap(s.medianDaysBetween)}
          help="Le rythme de vos habitués."
        />
        <Row label="Ticket moyen" value={`${s.avgTicketTnd.toFixed(2)} TND`} />
        <Row label="Dont ces 30 jours" value={`${s.revenue30d.toFixed(0)} TND`} />
        <Row
          label="Coût des récompenses"
          value={`− ${s.rewardCostTnd.toFixed(0)} TND`}
          help="Points échangés, à votre propre taux."
        />
      </Card>

      {/* ── the 30-day pulse ── */}
      <Trend daily={s.daily} />

      {/* ── what you still owe ── */}
      <Card title="Ce que vous devez encore">
        <Row
          label="Points en circulation"
          value={`${s.outstandingPoints}`}
          help={`≈ ${(s.outstandingPoints / s.pointsPerTnd).toFixed(0)} TND de récompenses à venir.`}
        />
        <Row label="Codes en attente" value={`${s.pendingCodes}`} help="Gagnés ou échangés, pas encore servis." />
      </Card>

      {s.topRewards.length > 0 && (
        <Card title="Ce qu'ils préfèrent">
          {s.topRewards.map((r) => (
            <Row key={r.label} label={r.label} value={`${r.claimed}×`} />
          ))}
        </Card>
      )}

      <p className="pt-1 text-center text-[10.5px] font-semibold text-slate/80">
        {s.customers} {plural(s.customers, "client", "clients")} · {s.pointsIssued} points émis ·{" "}
        {s.rewardsClaimed} {plural(s.rewardsClaimed, "récompense servie", "récompenses servies")}
      </p>
    </div>
  );
}

function PageTitle() {
  return <h1 className="px-1 text-[24px] font-extrabold text-charcoal">Analyses</h1>;
}

/** The headline: the retention number + the sentence that says what to do. */
function Hero({ s }: { s: Stats }) {
  const { tone, text } = verdict(s);
  const numCls = { good: "text-ok", ok: "text-gold-deep", bad: "text-seal", unknown: "text-slate" }[tone];
  const noteCls = {
    good: "bg-ok/10 text-ok",
    ok: "bg-gold-soft text-gold-deep",
    bad: "bg-seal-soft text-seal",
    unknown: "bg-lilac-2 text-slate",
  }[tone];

  return (
    <section className="o-card p-5">
      <p className="ticket-label">Est-ce qu&apos;ils reviennent&nbsp;?</p>
      {s.confident ? (
        <>
          <p className={`mt-1.5 font-display text-[58px] font-extrabold leading-[0.95] tabular-nums ${numCls}`}>
            {s.repeatRate}%
          </p>
          <p className="mt-1 text-[13.5px] font-semibold text-charcoal">
            de vos clients reviennent au moins une fois
          </p>
          <p className="text-[11.5px] text-slate">
            {s.repeatCustomers} {plural(s.repeatCustomers, "client fidèle", "clients fidèles")} sur {s.customers}
          </p>
        </>
      ) : (
        <p className="mt-2 font-display text-[22px] font-extrabold text-charcoal">Trop tôt pour conclure</p>
      )}
      <p className={`mt-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium leading-relaxed ${noteCls}`}>
        {text}
      </p>
    </section>
  );
}

function Tile({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone: "royal" | "ok";
}) {
  const cls = tone === "ok" ? "text-ok" : "text-royal";
  return (
    <div className="o-card p-4">
      <p className="text-[11px] font-semibold text-slate">{label}</p>
      <p className={`mt-1 font-display text-[28px] font-extrabold leading-none tabular-nums ${cls}`}>
        {value}
        {unit && <span className="ml-1 text-[13px] font-bold text-slate">{unit}</span>}
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="o-card overflow-hidden">
      <h2 className="px-4 pt-4 pb-1 text-[13px] font-extrabold text-charcoal">{title}</h2>
      <div className="px-1 pb-1">{children}</div>
    </section>
  );
}

function Row({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold text-charcoal">{label}</span>
        {help && <span className="mt-0.5 block text-[11px] leading-snug text-slate">{help}</span>}
      </span>
      <span className="shrink-0 whitespace-nowrap text-[13.5px] font-bold tabular-nums text-royal">
        {value}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="o-card px-5 py-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-lilac text-[22px]">📊</span>
      <p className="mt-3 text-[16px] font-extrabold text-charcoal">Pas encore de données</p>
      <p className="mx-auto mt-1 max-w-[30ch] text-[13px] leading-relaxed text-slate">
        Créditez votre premier ticket depuis la <b className="text-charcoal">Caisse</b>. Dès la
        deuxième visite d&apos;un client, cette page vous dira si la fidélité fonctionne.
      </p>
    </div>
  );
}

/** 30-day trend — gradient bars, today emphasised. One dimension, no library. */
function Trend({ daily }: { daily: Stats["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.revenue));
  const total = daily.reduce((sum, d) => sum + d.visits, 0);

  return (
    <section className="o-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[13px] font-extrabold text-charcoal">30 derniers jours</h2>
        <span className="text-[11px] font-semibold text-slate">{total} visites</span>
      </div>

      <div className="mt-3 flex h-[76px] items-end gap-[3px]">
        {daily.map((d, i) => {
          const last = i === daily.length - 1;
          return (
            <span
              key={d.day}
              title={`${d.day} · ${d.revenue.toFixed(2)} TND · ${d.visits} visite(s)`}
              className={`flex-1 rounded-t-[3px] ${
                d.revenue
                  ? last
                    ? "bg-gradient-to-t from-royal to-royal2"
                    : "bg-gradient-to-t from-royal/70 to-lavender"
                  : "bg-hair"
              }`}
              style={{ height: `${Math.max(3, (d.revenue / max) * 100)}%` }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-medium text-slate/80">
        <span>il y a 30 j</span>
        <span>aujourd&apos;hui</span>
      </div>
    </section>
  );
}
