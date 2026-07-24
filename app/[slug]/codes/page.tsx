import { notFound, redirect } from "next/navigation";
import { GiftIcon } from "@/components/icons";
import { getCafe, getDiner } from "@/lib/data";

export const metadata = { title: "Mes codes" };

const KIND_LABEL: Record<string, string> = {
  win: "Gain",
  reward: "Récompense",
  stamp: "Carte pleine",
};

/**
 * Every code the diner has to collect at the counter, in one place — rewards
 * they bought, and full stamp cards. Kept separate from the card itself so the
 * "what do I still have to pick up?" list is never buried.
 */
export default async function Codes({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cafe = await getCafe(slug);
  if (!cafe) notFound();

  const diner = await getDiner(cafe.id);
  if (!diner) redirect(`/${slug}/rejoindre`);

  const codes = diner.codes;

  return (
    <div className="flex flex-1 flex-col px-5 pb-6">
      <section className="pb-4 pt-3">
        <h1 className="text-[24px] font-extrabold">Mes codes</h1>
        <p className="mt-0.5 text-[13px] text-white/60">
          Montre-les au comptoir pour récupérer tes récompenses.
        </p>
      </section>

      {codes.length === 0 ? (
        <div className="d-card px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/12">
            <GiftIcon className="h-6 w-6 text-white" />
          </span>
          <p className="mt-3 text-[15px] font-bold text-white">Aucun code en attente</p>
          <p className="mx-auto mt-1 max-w-[28ch] text-[13px] text-white/60">
            Échange tes points dans les Offres — le code apparaîtra ici.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {codes.map((c) => (
            <li key={c.code} className="d-card flex items-center justify-between gap-3 px-4 py-3.5">
              <span className="min-w-0">
                <span className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-white/50">
                  {KIND_LABEL[c.kind] ?? "Récompense"}
                </span>
                <span className="block truncate text-[15px] font-bold text-white">{c.label}</span>
                <span className="mt-0.5 block text-[11px] font-medium text-[#ffd27a]">
                  {expiresIn(c.expiresAt)}
                </span>
              </span>
              <span className="shrink-0 rounded-xl bg-white px-3 py-2 text-center">
                <span className="block font-mono text-[18px] font-extrabold tracking-[0.14em] text-charcoal">
                  {c.code}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "expire dans 5 h" — the countdown a diner needs before a code lapses. */
function expiresIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expiré";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `expire dans ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `expire dans ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "expire demain" : `expire dans ${d} j`;
}
