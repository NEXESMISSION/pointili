import { traffic } from "@/lib/platform";
import { PageHead, Section, Stat } from "../ui";

export const metadata = { title: "Trafic" };

/**
 * WHAT THE ADS BROUGHT.
 *
 * The only page in this console that is about people who have NOT signed up —
 * which is exactly what ad money buys, and exactly why it does not belong on a
 * screen whose job is deciding what to do about existing shops. It sat between
 * the café roster and a drawer holding the audit log, and it is a different
 * job done at a different moment by a person asking a different question.
 *
 * EVERY BREAKDOWN CARRIES ITS CONVERSION, not just its volume. A source that
 * sends 400 visitors and no accounts is worse than one that sends 30 and
 * converts 6, and a table of visit counts alone says the opposite — loudly, and
 * in the direction that costs money.
 */
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function dwell(seconds: number) {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export default async function TrafficPage() {
  const data = await traffic(30);
  const { totals, daily } = data;
  const peak = Math.max(1, ...daily.map((d) => d.visits));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead
        title="Trafic"
        context={
          totals.visits === 0
            ? "Aucune visite enregistrée sur les 30 derniers jours."
            : `${totals.visits} visites et ${totals.signups} comptes créés sur ${data.days} jours.`
        }
      />

      {/*
        The privacy statement is ON the page rather than in a policy nobody
        opens, because it is also the answer to "why can't I see who that was?"
        — a question this page will be asked the first time it shows something
        interesting.
      */}
      <p className="mb-5 text-[12px] leading-relaxed text-slate">
        Anonyme par construction : une ligne par <b>visite</b>, jamais par personne. Ni
        adresse IP, ni user-agent, ni lien vers un compte — l&apos;identifiant de session
        meurt avec l&apos;onglet.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat label="Visites" value={totals.visits} sub={`sur ${data.days} jours`} />
        <Stat
          label="Comptes créés"
          value={totals.signups}
          sub={`${pct(totals.signups, totals.visits)} % des visites`}
          tone={totals.signups > 0 ? "ok" : undefined}
        />
        <Stat
          label="Temps médian"
          value={dwell(totals.median_seconds)}
          sub="hors passages de moins de 2 s"
        />
        <Stat
          label="Sources"
          value={data.sources.length}
          sub={
            data.campaigns.length
              ? `${data.campaigns.length} campagne${data.campaigns.length === 1 ? "" : "s"} taguée${
                  data.campaigns.length === 1 ? "" : "s"
                }`
              : "aucune campagne taguée"
          }
        />
      </div>

      {/*
        The window on this panel is READ OFF THE DATA, not stated. admin_traffic's
        `daily` series is hardcoded to 14 days and ignores p_days, while every
        tile above honours p_days (30) — so a fixed label here would be a claim
        about a window this panel does not control, and the two halves of one
        screen would disagree the day anyone changes the range.
      */}
      {daily.length > 0 && (
        <Section
          title="Jour par jour"
          aside={`${daily.length} jours · pic ${peak} visites`}
        >
          <div className="k-card p-4">
            <div className="flex h-[80px] items-end gap-[3px]">
              {daily.map((d) => (
                <span
                  key={d.day}
                  title={`${d.day} · ${d.visits} visite(s) · ${d.signups} compte(s)`}
                  /* --color-hair, not --o-inset: the bar sits on a white
                      k-card, and #f1f0f5 on #ffffff is about 1.05:1 — a volume
                      chart whose volume is invisible. */
                  className="flex-1 rounded-t-[2px] bg-hair"
                  style={{ height: `${Math.max(3, (d.visits / peak) * 100)}%` }}
                >
                  {/* The green cap is the share that converted — and it is only
                      drawn when something did. On a day with no visits the grey
                      bar is 3% tall, and a green cap on top of that reads as a
                      floating line with nothing under it, i.e. as a rendering
                      fault rather than as a quiet day. */}
                  {d.signups > 0 && (
                    <span
                      className="block w-full rounded-t-[2px] bg-[#2f9e6e]"
                      style={{ height: `${Math.max(8, pct(d.signups, Math.max(1, d.visits)))}%` }}
                    />
                  )}
                </span>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10.5px] text-slate">
              <span>{daily[0]?.day}</span>
              <span>aujourd&apos;hui</span>
            </div>
          </div>
        </Section>
      )}

      <div className="grid gap-2.5 lg:grid-cols-3">
        <Breakdown
          title="D'où ils viennent"
          empty="Aucune visite enregistrée."
          rows={data.sources.map((r) => ({ label: r.source, visits: r.visits, signups: r.signups }))}
        />
        <Breakdown
          title="Campagnes"
          empty="Ajoutez ?utm_campaign=… à vos liens d'annonce pour les distinguer ici."
          rows={data.campaigns.map((r) => ({
            label: r.campaign,
            visits: r.visits,
            signups: r.signups,
          }))}
        />
        <Breakdown
          title="Appareil"
          empty="Aucune visite enregistrée."
          rows={data.devices.map((r) => ({ label: r.device, visits: r.visits, signups: r.signups }))}
        />
      </div>
    </div>
  );
}

function Breakdown({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { label: string; visits: number; signups: number }[];
}) {
  const top = rows[0]?.visits ?? 0;

  return (
    <div className="k-card p-4">
      <h2 className="k-h">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2.5 text-[12.5px] leading-snug text-slate">{empty}</p>
      ) : (
        <ul className="mt-2.5 space-y-2.5">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate font-semibold text-charcoal">
                  {r.label}
                </span>
                <span className="k-num shrink-0 text-slate">
                  {r.visits}
                  {r.signups > 0 && (
                    <span className="ms-2 font-bold text-[#1f7a52]">
                      {r.signups} compte{r.signups === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
              </div>
              {/* the bar is volume; the green segment inside it is what converted */}
              <span className="mt-1 block h-[5px] overflow-hidden rounded-full bg-[var(--o-inset)]">
                <span
                  /* same reason as the chart above: this is the bar, and it has
                     to read against the white card behind its track. */
                  className="block h-full rounded-full bg-hair"
                  style={{ width: `${top > 0 ? Math.max(4, (r.visits / top) * 100) : 0}%` }}
                >
                  <span
                    className="block h-full rounded-full bg-[#2f9e6e]"
                    style={{ width: `${pct(r.signups, r.visits)}%` }}
                  />
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
