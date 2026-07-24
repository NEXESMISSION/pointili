import { notFound, redirect } from "next/navigation";
import { GiftIcon } from "@/components/icons";
import { getCafe, getDiner, getRewards, nextRewardNudge } from "@/lib/data";
import { RedeemForm } from "./RedeemForm";

export const metadata = { title: "Offres" };

export default async function Offres({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cafe = await getCafe(slug);
  if (!cafe) notFound();

  const [diner, rewards] = await Promise.all([
    getDiner(cafe.id),
    getRewards(cafe.id),
  ]);
  if (!diner) redirect(`/${slug}/rejoindre`);

  const nudge = nextRewardNudge(diner.balance, rewards);
  const ladder = [...rewards].sort((a, b) => a.pointsCost - b.pointsCost);

  return (
    <div className="flex flex-1 flex-col">
      {/* ── hero ───────────────────────────────────────────── */}
      <section className="px-5 pb-6 pt-2 text-white">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[24px] font-extrabold">Offres</h1>
          <span className="text-[14px] font-bold tabular-nums">
            {diner.balance} points{" "}
            <span className="ml-0.5 inline-grid h-5 w-5 place-items-center rounded-full bg-gradient-to-b from-[#ffe08a] to-[#f0a819] align-[-3px] text-[10px]">
              ⭐
            </span>
          </span>
        </div>
        {nudge && (
          <p className="mt-1 text-[13px] font-medium text-white/80">
            Encore <b className="text-white">{nudge.needed} points</b> pour{" "}
            {nudge.target.label.toLowerCase()} !
          </p>
        )}
      </section>

      {/* ── the white sheet ────────────────────────────────── */}
      <div className="flex-1 rounded-t-[28px] bg-white px-5 pb-6 pt-5">
        {ladder.length === 0 ? (
          <div className="rounded-2xl border border-hair bg-lilac-2/60 px-5 py-10 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-charcoal text-white">
              <GiftIcon className="h-6 w-6" />
            </span>
            <p className="mt-3 text-[15px] font-bold text-charcoal">
              Pas encore d&apos;offres
            </p>
            <p className="mx-auto mt-1 max-w-[26ch] text-[13px] text-slate">
              Continue de cumuler des points — {cafe.name} en prépare.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {ladder.map((r) => {
              const affordable = diner.balance >= r.pointsCost;
              return (
                <li
                  key={r.id}
                  className={`flex items-center gap-3.5 rounded-2xl border bg-white px-3.5 py-3 shadow-[0_8px_20px_-14px_rgba(40,18,59,.35)] ${
                    affordable ? "border-royal/30" : "border-hair"
                  }`}
                >
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
                    <img
                      src={r.imageUrl}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <span
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                        affordable ? "bg-charcoal text-white" : "bg-lilac-2 text-slate"
                      }`}
                    >
                      <GiftIcon className="h-5 w-5" />
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold text-charcoal">
                      {r.label}
                    </span>
                    <span
                      className={`block text-[12.5px] font-bold ${
                        affordable ? "text-gold" : "text-slate"
                      }`}
                    >
                      {r.pointsCost} points 🪙
                    </span>
                    {/* How close am I? A locked row with no progress is just a
                        price tag. */}
                    {!affordable && (
                      <span className="mt-1.5 block h-[4px] w-full overflow-hidden rounded-full bg-lilac-2">
                        <span
                          className="block h-full rounded-full bg-royal/60"
                          style={{
                            width: `${Math.min(100, Math.round((diner.balance / r.pointsCost) * 100))}%`,
                          }}
                        />
                      </span>
                    )}
                  </span>

                  <RedeemForm
                    slug={slug}
                    reward={r}
                    affordable={affordable}
                    missing={r.pointsCost - diner.balance}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
