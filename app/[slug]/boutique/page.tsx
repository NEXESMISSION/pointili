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

  const [diner, rewards] = await Promise.all([getDiner(cafe.id), getRewards(cafe.id)]);
  if (!diner) redirect(`/${slug}/rejoindre`);

  const nudge = nextRewardNudge(diner.balance, rewards);
  const ladder = [...rewards].sort((a, b) => a.pointsCost - b.pointsCost);

  return (
    <div className="flex flex-1 flex-col px-5 pb-6">
      <section className="pb-4 pt-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[24px] font-extrabold">Offres</h1>
          <span className="text-[14px] font-bold tabular-nums text-white/90">{diner.balance} points ⭐</span>
        </div>
        {nudge && (
          <p className="mt-1 text-[13px] font-medium text-white/70">
            Encore <b className="text-white">{nudge.needed} points</b> pour{" "}
            {nudge.target.label.toLowerCase()} !
          </p>
        )}
      </section>

      {ladder.length === 0 ? (
        <div className="d-card px-5 py-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/12">
            <GiftIcon className="h-6 w-6 text-white" />
          </span>
          <p className="mt-3 text-[15px] font-bold text-white">Pas encore d&apos;offres</p>
          <p className="mx-auto mt-1 max-w-[26ch] text-[13px] text-white/60">
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
                className={`flex items-center gap-3.5 rounded-2xl border bg-white/[0.06] px-3.5 py-3 ${
                  affordable ? "border-white/30" : "border-white/12"
                }`}
              >
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
                  <img src={r.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/12">
                    <GiftIcon className="h-5 w-5 text-white" />
                  </span>
                )}

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-bold text-white">{r.label}</span>
                  <span className={`block text-[12.5px] font-bold ${affordable ? "text-[#ffd27a]" : "text-white/55"}`}>
                    {r.pointsCost} points 🪙
                  </span>
                  {!affordable && (
                    <span className="mt-1.5 block h-[4px] w-full overflow-hidden rounded-full bg-white/12">
                      <span
                        className="block h-full rounded-full bg-white/70"
                        style={{ width: `${Math.min(100, Math.round((diner.balance / r.pointsCost) * 100))}%` }}
                      />
                    </span>
                  )}
                </span>

                <RedeemForm slug={slug} reward={r} affordable={affordable} missing={r.pointsCost - diner.balance} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
