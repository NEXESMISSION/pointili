import { notFound, redirect } from "next/navigation";
import { CafeClosed } from "@/components/CafeClosed";
import { GiftIcon } from "@/components/icons";
import { getCafe, getGame, getMember, getRewards, nextRewardNudge } from "@/lib/data";
import { RewardPicker } from "./RewardPicker";
import { WheelPlayer } from "./WheelPlayer";
import { fmtPoints } from "@/lib/points";

export const metadata = { title: "Récompenses" };

export default async function Recompenses({
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

  // getGame returns null unless the owner has switched the wheel ON and given it
  // at least one segment — so the whole block below disappears on its own.
  const [diner, rewards, game] = await Promise.all([
    getMember(cafe.id),
    getRewards(cafe.id),
    getGame(cafe.id),
  ]);
  if (!diner) redirect(`/${slug}/rejoindre`);

  const nudge = nextRewardNudge(diner.balance, rewards);
  const ladder = [...rewards].sort((a, b) => a.pointsCost - b.pointsCost);

  return (
    <div className="relative flex flex-1 flex-col px-5 pb-8">
      <div className="relative mx-auto w-full max-w-[420px]">
        <section className="pb-5 pt-3 text-center">
          <h1 className="text-[21px] font-extrabold text-charcoal">Choisis ta récompense</h1>
          <p className="mt-1 text-[13.5px] text-slate">
            Échange tes points contre du réel, chez {cafe.name}.
          </p>
          {/* The balance in the shop's own colour — it is the number every row
              below is measured against. */}
          <p
            className="mt-3 inline-flex items-baseline gap-1.5 rounded-full px-4 py-1.5"
            style={{ background: "var(--cafe-soft)" }}
          >
            <span
              className="text-[16.5px] font-extrabold tabular-nums"
              style={{ color: "var(--cafe-text)" }}
            >
              {fmtPoints(diner.balance)}
            </span>
            <span className="text-[12.5px] font-semibold text-slate">points disponibles</span>
          </p>
          {nudge && (
            <p className="mt-2 text-[12.5px] text-slate">
              Encore <b className="font-extrabold text-charcoal">{nudge.needed}</b> pour{" "}
              {nudge.target.label.toLowerCase()}.
            </p>
          )}
        </section>

        {game && (
          <WheelPlayer
            slug={slug}
            prizes={game.prizes}
            spinCost={game.spinCost}
            balance={diner.balance}
          />
        )}

        {ladder.length === 0 ? (
          <div className="d-card px-5 py-10 text-center">
            <span
              className="mx-auto grid h-12 w-12 place-items-center rounded-2xl"
              style={{ background: "var(--cafe-soft)", color: "var(--cafe-text)" }}
            >
              <GiftIcon className="h-6 w-6" />
            </span>
            <p className="mt-3 text-[14px] font-bold text-charcoal">Pas encore d&apos;offres</p>
            <p className="mx-auto mt-1 max-w-[26ch] text-[13px] text-slate">
              Continue de cumuler des points — {cafe.name} en prépare.
            </p>
          </div>
        ) : (
          <RewardPicker slug={slug} rewards={ladder} balance={diner.balance} />
        )}
      </div>
    </div>
  );
}
