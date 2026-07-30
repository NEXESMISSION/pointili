import { notFound, redirect } from "next/navigation";
import { CafeClosed } from "@/components/CafeClosed";
import { GiftIcon } from "@/components/icons";
import { getCafe, getMember, getRewards, nextRewardNudge } from "@/lib/data";
import { RewardPicker } from "./RewardPicker";
import { BackLink } from "@/components/BackLink";

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

  const [diner, rewards] = await Promise.all([getMember(cafe.id), getRewards(cafe.id)]);
  if (!diner) redirect(`/${slug}/rejoindre`);

  const nudge = nextRewardNudge(diner.balance, rewards);
  const ladder = [...rewards].sort((a, b) => a.pointsCost - b.pointsCost);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden px-5 pb-8">
      {/* the same ambient glow as the signup screen — one client look */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 left-1/2 h-[300px] w-[300px] -translate-x-1/2 rounded-full opacity-60 blur-[70px]"
        style={{ background: "radial-gradient(circle, #7b52ff 0%, transparent 68%)" }}
      />

      <div className="relative mx-auto w-full max-w-[420px]">
        <div className="pt-3">
          <BackLink fallback={`/${slug}`} />
        </div>
        <section className="pb-5 pt-1 text-center">
          <h1 className="text-[24px] font-extrabold text-white">Choisis ta récompense</h1>
          <p className="mt-1 text-[13.5px] text-white/55">
            Échange tes points contre du réel, chez {cafe.name}.
          </p>
          <p className="mt-3 inline-flex items-baseline gap-1.5 rounded-full bg-white/[0.08] px-4 py-1.5">
            <span className="text-[18px] font-extrabold tabular-nums text-[#b9a3ff]">
              {diner.balance}
            </span>
            <span className="text-[12.5px] font-semibold text-white/60">points disponibles</span>
          </p>
          {nudge && (
            <p className="mt-2 text-[12.5px] text-white/50">
              Encore <b className="text-white/80">{nudge.needed}</b> pour{" "}
              {nudge.target.label.toLowerCase()}.
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
          <RewardPicker slug={slug} rewards={ladder} balance={diner.balance} />
        )}
      </div>
    </div>
  );
}
