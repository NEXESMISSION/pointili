import type { Traffic as TrafficData } from "@/lib/platform";

/**
 * What the ads brought.
 *
 * Four numbers, then the three breakdowns that decide where the next dinar
 * goes: which source, which campaign, which device.
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

function Tile({ k, v, s, tone }: { k: string; v: string; s: string; tone?: "good" }) {
  return (
    <div className="rounded-2xl bg-[var(--o-inset)] p-4 ring-1 ring-[var(--o-edge)]">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-slate">{k}</div>
      <div className={`mt-1.5 text-[26px] font-extrabold leading-none tabular-nums ${tone === "good" ? "text-[#1f7a52]" : ""}`}>
        {v}
      </div>
      <div className="mt-1 text-[12px] text-slate">{s}</div>
    </div>
  );
}

function Breakdown({
  title, empty, rows,
}: {
  title: string;
  empty: string;
  rows: { label: string; visits: number; signups: number }[];
}) {
  const top = rows[0]?.visits ?? 0;
  return (
    <div className="rounded-2xl bg-[var(--o-inset)] p-4 ring-1 ring-[var(--o-edge)]">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.09em] text-slate">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-slate">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 flex-1 truncate font-semibold">{r.label}</span>
                <span className="shrink-0 tabular-nums text-slate">
                  {r.visits}
                  {r.signups > 0 && (
                    <span className="ml-2 font-bold text-[#1f7a52]">
                      {r.signups} compte{r.signups === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
              </div>
              {/* the bar is volume; the green segment inside it is what converted */}
              <span className="mt-1.5 block h-[5px] overflow-hidden rounded-full bg-[var(--o-inset)]">
                <span
                  className="block h-full rounded-full bg-[var(--o-inset)]"
                  style={{ width: `${top > 0 ? Math.max(3, (r.visits / top) * 100) : 0}%` }}
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

export function Traffic({ data }: { data: TrafficData }) {
  const { totals, daily } = data;
  const peak = Math.max(1, ...daily.map((d) => d.visits));

  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-extrabold">Le trafic</h2>
        <span className="text-[12px] text-slate">{data.days} derniers jours</span>
      </div>
      <p className="mt-1 text-[12.5px] text-slate">
        Anonyme : une ligne par visite, jamais par personne. Ni IP, ni appareil
        identifiable, ni lien vers un compte.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile k="Visites" v={String(totals.visits)} s={`sur ${data.days} jours`} />
        <Tile
          k="Comptes créés"
          v={String(totals.signups)}
          s={`${pct(totals.signups, totals.visits)}% des visites`}
          tone="good"
        />
        <Tile k="Temps médian" v={dwell(totals.median_seconds)} s="hors passages < 2s" />
        <Tile
          k="Sources"
          v={String(data.sources.length)}
          s={data.campaigns.length ? `${data.campaigns.length} campagne(s)` : "aucune campagne taguée"}
        />
      </div>

      {/* 14 days, oldest first. Zero days are drawn as zero, not skipped. */}
      {daily.length > 0 && (
        <div className="mt-3 rounded-2xl bg-[var(--o-inset)] p-4 ring-1 ring-[var(--o-edge)]">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.09em] text-slate">
            14 jours
          </h3>
          <div className="mt-3 flex h-[70px] items-end gap-[3px]">
            {daily.map((d) => (
              <span
                key={d.day}
                title={`${d.day} · ${d.visits} visite(s) · ${d.signups} compte(s)`}
                className="flex-1 rounded-t-[3px] bg-[var(--o-inset)]"
                style={{ height: `${Math.max(2, (d.visits / peak) * 100)}%` }}
              >
                <span
                  className="block w-full rounded-t-[3px] bg-[#2f9e6e]"
                  style={{ height: `${pct(d.signups, Math.max(1, d.visits))}%` }}
                />
              </span>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate">
            <span>{daily[0]?.day}</span>
            <span>aujourd&apos;hui</span>
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Breakdown
          title="D'où ils viennent"
          empty="Aucune visite enregistrée."
          rows={data.sources.map((r) => ({ label: r.source, visits: r.visits, signups: r.signups }))}
        />
        <Breakdown
          title="Campagnes"
          empty="Ajoutez ?utm_campaign=… à vos liens d'annonce."
          rows={data.campaigns.map((r) => ({ label: r.campaign, visits: r.visits, signups: r.signups }))}
        />
        <Breakdown
          title="Appareil"
          empty="Aucune visite enregistrée."
          rows={data.devices.map((r) => ({ label: r.device, visits: r.visits, signups: r.signups }))}
        />
      </div>
    </section>
  );
}
