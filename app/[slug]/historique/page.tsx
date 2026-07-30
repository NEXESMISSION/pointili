import { notFound, redirect } from "next/navigation";
import { CafeClosed } from "@/components/CafeClosed";
import { getCafe, getMember } from "@/lib/data";
import { getActivity, type Activity } from "@/lib/db";
import { BackLink } from "@/components/BackLink";

export const metadata = { title: "Historique" };

const LABELS: Record<Activity["reason"], string> = {
  earn: "Achat",
  welcome: "Bienvenue",
  redeem: "Échange",
  adjust: "Ajustement",
  expire: "Expiration",
  collected: "Récupéré",
};

/** "il y a 2 j" — elapsed time is the useful bit, not a raw date. */
function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hier" : `il y a ${d} j`;
}

export default async function Historique({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cafe = await getCafe(slug);
  if (!cafe) notFound();
  // Re-checked per PAGE, not just in the layout: Next does not re-run a layout
  // on client-side transitions, so a shop that went dark mid-session kept
  // serving every screen.
  if (!cafe.live) return <CafeClosed name={cafe.name} />;

  const diner = await getMember(cafe.id);
  if (!diner) redirect(`/${slug}/rejoindre`);

  const activity = await getActivity(cafe.id, diner.phone, 30);

  return (
    <div className="flex flex-1 flex-col px-5 pb-6">
      <section className="pb-4 pt-3">
        <BackLink fallback={`/${slug}`} />
        <h1 className="mt-1 text-[24px] font-extrabold">Historique</h1>
        <p className="mt-0.5 text-[13px] text-white/60">Tes points et tes récompenses.</p>
      </section>

      {activity.length === 0 ? (
        <p className="d-card px-4 py-12 text-center text-[13.5px] text-white/60">
          Rien pour l&apos;instant — tes points et tes récompenses s&apos;afficheront ici.
        </p>
      ) : (
        <ul className="d-card divide-y divide-white/10 px-4">
          {activity.map((a, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold text-white">
                  {a.reason === "collected" ? `Récupéré${a.label ? ` · ${a.label}` : ""}` : LABELS[a.reason]}
                </span>
                <span className="block text-[11px] text-white/50">{ago(a.at)}</span>
              </span>
              {a.reason === "collected" ? (
                <span className="shrink-0 text-[12px] font-bold text-white/80">✓ pris</span>
              ) : (
                <span
                  className={`shrink-0 text-[14px] font-bold tabular-nums ${
                    a.delta > 0 ? "text-[#7ff0b0]" : "text-white/55"
                  }`}
                >
                  {a.delta > 0 ? "+" : ""}
                  {a.delta}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
