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

/**
 * Analytics — the page that decides whether Pointili is worth paying for.
 *
 * It answers one question: are people coming back, and does that make money?
 * So it leads with a plain-French verdict, then the retention proof, then the
 * money. Signups and spins are vanity — they're at the bottom, small.
 */
export default async function Analytics() {
  const cafe = await ownerCafe();
  // No café yet → set one up. NOT /owner/login: that would see a
  // valid session and bounce straight back here, forever.
  if (!cafe) redirect("/owner/nouveau");
  const s = await getStats(cafe.id);

  return (
    <div className="space-y-5">
      <div>
        <p className="ticket-label">◆ {cafe.name}</p>
        <h1 className="mt-1 font-display text-[26px]">Analyses</h1>
      </div>

      {s.customers === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Verdict s={s} />

          {/* ── 1. do they come back? ── */}
          <Section title="Est-ce qu'ils reviennent ?" tag="la seule vraie question">
            <Big
              value={`${s.repeatRate}%`}
              label="de vos clients sont revenus au moins une fois"
              sub={`${s.repeatCustomers} ${plural(s.repeatCustomers, "client fidèle", "clients fidèles")} sur ${s.customers}`}
              // Grey it out under the sample threshold: the number is real, but
              // it isn't yet evidence of anything.
              tone={!s.confident ? "muted" : s.repeatRate >= 30 ? "good" : s.repeatRate >= 15 ? "ok" : "bad"}
            />
            <Row
              label="Visites par client"
              value={`${s.visitsPerCustomer}`}
              help="Plus c'est haut, plus la boucle tourne."
            />
            <Row
              label="Délai entre deux visites"
              value={s.medianDaysBetween === null ? "—" : formatGap(s.medianDaysBetween)}
              help="Le rythme habituel de vos habitués."
            />
            <Row
              label="Revenus sous 30 j"
              value={`${s.returnedWithin30d}%`}
              help="Des nouveaux clients du mois qui sont déjà revenus."
            />
          </Section>

          {/* ── 2. does it make money? ── */}
          <Section title="Est-ce que ça rapporte ?" tag="chiffres réels">
            <Row
              label="Chiffre d'affaires suivi"
              value={`${s.revenueTnd.toFixed(2)} TND`}
              help="Encaissé via la caisse Pointili."
              strong
            />
            <Row label="Dont ces 30 jours" value={`${s.revenue30d.toFixed(2)} TND`} />
            <Row label="Ticket moyen" value={`${s.avgTicketTnd.toFixed(2)} TND`} />
            <Row
              label="Coût des récompenses"
              value={`− ${s.rewardCostTnd.toFixed(2)} TND`}
              help="Points échangés, valorisés à votre propre taux."
            />
            <Row
              label="Net"
              value={`${s.netTnd.toFixed(2)} TND`}
              help="Chiffre d'affaires suivi moins les récompenses servies."
              strong
            />
          </Section>

          {/* ── 3. what you still owe ── */}
          <Section title="Ce que vous devez" tag="engagement">
            <Row
              label="Points en circulation"
              value={`${s.outstandingPoints}`}
              help={`Soit ~${(s.outstandingPoints / s.pointsPerTnd).toFixed(0)} TND de récompenses que vos clients peuvent encore réclamer.`}
            />
            <Row label="Codes en attente" value={`${s.pendingCodes}`} help="Gagnés ou échangés, pas encore servis." />
          </Section>

          <Trend daily={s.daily} />

          {s.topRewards.length > 0 && (
            <Section title="Ce qu'ils préfèrent" tag="récompenses servies">
              {s.topRewards.map((r) => (
                <Row key={r.label} label={r.label} value={`${r.claimed}×`} />
              ))}
            </Section>
          )}

          {/* vanity metrics, deliberately last and small */}
          <p className="pt-1 text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">
            {s.customers} {plural(s.customers, "client", "clients")} ·{" "}
            {s.pointsIssued} points émis · {s.plays}{" "}
            {plural(s.plays, "tour joué", "tours joués")}
          </p>
        </>
      )}
    </div>
  );
}

/** Plain French, so the owner doesn't have to interpret anything. */
function Verdict({ s }: { s: Stats }) {
  let tone: "good" | "ok" | "bad" | "unknown" = "bad";
  let text: string;

  if (!s.confident) {
    // Honesty over flattery: with a handful of customers a repeat rate is either
    // 0% or 100% and means nothing. Saying "it works!" off 1 customer would
    // invite a real business decision based on noise.
    tone = "unknown";
    const left = MIN_SAMPLE - s.customers;
    text =
      s.customers === 0
        ? "Aucun client n'est encore passé en caisse. Créditez un premier ticket pour démarrer."
        : `Trop tôt pour conclure : ${s.customers} client${s.customers > 1 ? "s" : ""} seulement. Encore ${left} pour que les chiffres veuillent dire quelque chose.`;
  } else if (s.repeatCustomers === 0) {
    text =
      "Personne n'est encore revenu. Vos récompenses sont probablement hors de portée — visez un premier cadeau atteignable en 2–3 visites.";
  } else if (s.repeatRate >= 30) {
    tone = "good";
    text = `${s.repeatRate}% de vos clients reviennent${
      s.medianDaysBetween !== null ? `, en moyenne ${formatGap(s.medianDaysBetween)}` : ""
    }. La fidélité fonctionne : gardez le cap.`;
  } else if (s.repeatRate >= 15) {
    tone = "ok";
    text = `${s.repeatRate}% reviennent. C'est un début. Baissez le prix de votre première récompense pour que le premier palier soit atteignable en 2–3 visites.`;
  } else {
    text = `Seulement ${s.repeatRate}% reviennent. Vos récompenses sont sans doute trop chères, ou trop peu désirables. Visez un premier cadeau atteignable en 2–3 visites.`;
  }

  const colour =
    tone === "good"
      ? "border-ok/40 bg-ok/10 text-ok"
      : tone === "ok"
        ? "border-gold/40 bg-gold-soft text-gold-deep"
        : tone === "unknown"
          ? "border-line bg-paper2 text-ink2"
          : "border-seal/40 bg-seal-soft text-seal";

  return (
    <section className={`rounded-xl border-[1.5px] p-4 ${colour}`}>
      <p className="ticket-label mb-1 !text-current opacity-70">Verdict</p>
      <p className="text-[13.5px] leading-relaxed font-medium">{text}</p>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-line px-5 py-10 text-center">
      <p className="font-display text-[19px]">Pas encore de données</p>
      <p className="mx-auto mt-2 max-w-[30ch] text-[13px] leading-relaxed text-mut">
        Créditez votre premier ticket depuis la <b className="text-ink2">Caisse</b>.
        Dès la deuxième visite d&apos;un client, cette page vous dira si la
        fidélité fonctionne.
      </p>
    </div>
  );
}

function Section({
  title,
  tag,
  children,
}: {
  title: string;
  tag: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-paper2">
      <div className="flex items-baseline gap-2 border-b border-line px-4 py-3">
        <h2 className="font-display text-[16px]">{title}</h2>
        <span className="ml-auto text-[9px] font-semibold uppercase tracking-[0.06em] text-mut">
          {tag}
        </span>
      </div>
      {children}
    </section>
  );
}

function Big({
  value,
  label,
  sub,
  tone,
}: {
  value: string;
  label: string;
  sub: string;
  tone: "good" | "ok" | "bad" | "muted";
}) {
  const colour =
    tone === "good"
      ? "text-ok"
      : tone === "ok"
        ? "text-gold"
        : tone === "muted"
          ? "text-mut"
          : "text-seal";
  return (
    <div className="border-b border-line/60 px-4 py-4">
      <p className={`font-display text-[40px] leading-none tabular-nums ${colour}`}>
        {value}
      </p>
      <p className="mt-1.5 text-[13px] leading-snug text-ink2">{label}</p>
      <p className="mt-0.5 font-mono text-[10.5px] text-mut">{sub}</p>
    </div>
  );
}

function Row({
  label,
  value,
  help,
  strong = false,
}: {
  label: string;
  value: string;
  help?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 px-4 py-3 last:border-b-0">
      <span className="min-w-0">
        <span className={`block text-[13.5px] ${strong ? "font-bold text-ink" : "font-semibold text-ink"}`}>
          {label}
        </span>
        {help && (
          <span className="mt-0.5 block text-[11px] leading-snug text-mut">{help}</span>
        )}
      </span>
      <span
        className={`shrink-0 whitespace-nowrap font-mono tabular-nums ${
          strong ? "text-[14px] font-bold text-ink" : "text-[12.5px] font-bold text-brand"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** 30-day bars. No chart library — it's one dimension. */
function Trend({ daily }: { daily: Stats["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.revenue));
  const total = daily.reduce((s, d) => s + d.visits, 0);

  return (
    <section className="rounded-xl border border-line bg-paper2 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[16px]">30 derniers jours</h2>
        <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-mut">
          {total} visites
        </span>
      </div>

      <div className="mt-3 flex h-[70px] items-end gap-[3px]">
        {daily.map((d) => (
          <span
            key={d.day}
            title={`${d.day} · ${d.revenue.toFixed(2)} TND · ${d.visits} visite(s)`}
            className="flex-1 rounded-t-[2px] bg-brand"
            style={{
              height: `${Math.max(2, (d.revenue / max) * 100)}%`,
              opacity: d.revenue ? 0.85 : 0.18,
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] text-faint">
        <span>il y a 30 j</span>
        <span>aujourd&apos;hui</span>
      </div>
    </section>
  );
}
