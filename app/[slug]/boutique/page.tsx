import { notFound, redirect } from "next/navigation";
import { CafeClosed } from "@/components/CafeClosed";
import { GiftIcon } from "@/components/icons";
import { getCafe, getGame, getMember, getRewards, nextRewardNudge } from "@/lib/data";
import { RewardPicker } from "./RewardPicker";
import { WheelPlayer } from "./WheelPlayer";
import { Tpl } from "@/components/Tpl";
import { currentLang, t as translation } from "@/lib/i18n";

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

  /* French or Tunisian. The picker is a client component, so it gets the LANG
     and builds its own translator — passing `t` across that boundary is not
     possible, it is a function. */
  const lang = await currentLang();
  const t = await translation();

  return (
    <div className="relative flex flex-1 flex-col px-5 pb-8">
      <div className="relative mx-auto w-full max-w-[420px]">
        <section className="pb-5 pt-3 text-center">
          <h1 className="text-[21px] font-extrabold text-charcoal">
            {t("Choisis ta récompense")}
          </h1>
          <p className="mt-1 text-[13.5px] text-slate">
            {t("Échange tes points contre du réel, chez {shop}.", { shop: cafe.name })}
          </p>
          {/* The balance in the shop's own colour — it is the number every row
              below is measured against. */}
          {/* The label's own size and colour live HERE now, on the pill, not on
              a second <span> — the sentence is one string in the dictionary and
              only its {n} is a separate node, so there is nothing else left to
              style. gap-1.5 is gone with it: the space is inside the sentence,
              and Tunisian puts the word on the other side of the figure. */}
          {/* inline-BLOCK, not inline-flex, and that is a bug fix rather than a
              preference. A flex container turns each text run into an anonymous
              item and strips the whitespace between them, so a sentence split
              around its {n} rendered as "10 نقاطعندك" with no space. Inline
              layout keeps the spaces the sentence was written with, and text
              baselines already align without items-baseline. */}
          <p
            className="mt-3 inline-block rounded-full px-4 py-1.5 text-[12.5px] font-semibold text-slate"
            style={{ background: "var(--cafe-soft)" }}
          >
            {/* «10 نقاط عندك» — the figure keeps the shop's colour, the unit
                and the word order come from the sentence. */}
            <Tpl
              tpl={t("{n} disponibles")}
              slots={{
                n: (
                  <span
                    className="text-[16.5px] font-extrabold tabular-nums"
                    style={{ color: "var(--cafe-text)" }}
                  >
                    {t.n(diner.balance, "point")}
                  </span>
                ),
              }}
            />
          </p>
          {nudge && (
            <p className="mt-2 text-[12.5px] text-slate">
              <Tpl
                tpl={t("Encore {n} pour {reward}.")}
                slots={{
                  n: <b className="font-extrabold text-charcoal">{t.n(nudge.needed, "point")}</b>,
                  /* No .toLowerCase() any more: it was lowering the shop's own
                     reward name, which does nothing to Arabic script and was
                     already wrong for a name like "Brunch Le Manar". */
                  reward: t(nudge.target.label),
                }}
              />
            </p>
          )}
        </section>

        {ladder.length === 0 ? (
          <div className="d-card px-5 py-10 text-center">
            <span
              className="mx-auto grid h-12 w-12 place-items-center rounded-2xl"
              style={{ background: "var(--cafe-soft)", color: "var(--cafe-text)" }}
            >
              <GiftIcon className="h-6 w-6" />
            </span>
            <p className="mt-3 text-[14px] font-bold text-charcoal">
              {t("Pas encore d'offres")}
            </p>
            <p className="mx-auto mt-1 max-w-[26ch] text-[13px] text-slate">
              {t("Continue de cumuler des points — {shop} en prépare.", { shop: cafe.name })}
            </p>
          </div>
        ) : (
          <RewardPicker slug={slug} rewards={ladder} balance={diner.balance} lang={lang} />
        )}
      </div>

      {/*
        ══ THE WHEEL, OUT OF THE WAY ══════════════════════════════════════
        It used to open this screen: a 240px wheel above the rewards, so the
        first thing a customer saw on "Choisis ta récompense" was a game they
        had to scroll past to reach the thing they came for. The rewards are the
        product; the wheel is a diversion an owner can switch on.

        A floating button keeps it one tap away and returns the screen to the
        list. Only rendered when the shop actually runs one.
      */}
      {game && (
        <WheelPlayer
          slug={slug}
          prizes={game.prizes}
          spinCost={game.spinCost}
          balance={diner.balance}
        />
      )}
    </div>
  );
}
