import { notFound, redirect } from "next/navigation";
import { GiftIcon } from "@/components/icons";
import { getCafe, getDiner, getRewards, nextRewardNudge } from "@/lib/data";
import { RedeemForm } from "./RedeemForm";

export const metadata = { title: "Boutique" };

export default async function Boutique({
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
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-[25px] font-black text-ink">Boutique</h1>
        <span className="font-mono text-[13px] font-bold text-brand tabular-nums">
          {diner.balance} pts
        </span>
      </header>

      {nudge && (
        <p className="text-[13.5px] text-ink2">
          Encore <b className="text-brand">{nudge.needed} points</b> pour{" "}
          {nudge.target.label.toLowerCase()}.
        </p>
      )}

      {/* A café can turn loyalty on before adding any reward — don't leave the
          diner staring at a blank list that looks broken. */}
      {ladder.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper px-5 py-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-canvas text-mut">
            <GiftIcon className="h-6 w-6" />
          </span>
          <p className="mt-3 text-[15px] font-semibold text-ink">
            Pas encore de récompenses
          </p>
          <p className="mx-auto mt-1 max-w-[26ch] text-[13px] text-mut">
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
              className={`flex items-center gap-3.5 rounded-2xl border bg-paper p-3.5 ${
                affordable ? "border-brand/30" : "border-line"
              }`}
            >
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                  affordable ? "bg-brand-soft text-brand" : "bg-canvas text-mut"
                }`}
              >
                <GiftIcon className="h-[22px] w-[22px]" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-semibold text-ink">
                  {r.label}
                </span>
                <span className="mt-0.5 block text-[12px] text-mut">
                  {r.pointsCost} points
                </span>
                {/* How close am I? The same goal-gradient nudge as Ma carte —
                    a locked row with no progress is just a price tag. */}
                {!affordable && (
                  <span className="mt-1.5 block h-[4px] w-full overflow-hidden rounded-full bg-kraft2">
                    <span
                      className="block h-full rounded-full bg-brand/60"
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
  );
}
