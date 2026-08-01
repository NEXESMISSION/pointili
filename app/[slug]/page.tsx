import Link from "next/link";
import { CafeClosed } from "@/components/CafeClosed";
import { notFound, redirect } from "next/navigation";
import { GiftIcon, ScanIcon, Sparkle } from "@/components/icons";
import { getCafe, getLoyaltyProgram, getMember, getRewards, nextRewardNudge } from "@/lib/data";
import { balanceSinceLastOpen, touchCardOpened } from "@/lib/db";
import type { LoyaltyProgram } from "@/lib/types";
import { CardArrived } from "@/components/CardArrived";
import { CountUp } from "@/components/CountUp";
import { RewardUnlocked } from "@/components/RewardUnlocked";
import { fmtPoints } from "@/lib/points";

/**
 * Carte — the diner's loyalty card, in the deep-purple mockup:
 * greeting + points badge, then the STAMP card (a punch card that fills toward a
 * reward) when the café runs stamps, or a points-progress card when it doesn't.
 * Points always accrue, so offers show in both modes.
 */
export default async function Carte({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ nouveau?: string }>;
}) {
  const { slug } = await params;
  // Set only by /rejoindre, and stripped by the overlay the moment it plays.
  const { nouveau } = await searchParams;
  const cafe = await getCafe(slug);
  if (!cafe) notFound();
  // Re-checked per PAGE, not just in the layout: Next does not re-run a layout
  // on client-side transitions, so a shop that went dark mid-session kept
  // serving every screen.
  if (!cafe.live) return <CafeClosed name={cafe.name} />;

  /*
    Signed in AND a member here. A diner who scans a NEW café's QR is signed in
    but has no card yet — /rejoindre enrolls them (welcome bonus + per-shop code)
    so the card never renders empty.
  */
  const diner = await getMember(cafe.id);
  if (!diner) redirect(`/${slug}/rejoindre`);

  /*
    READ BEFORE TOUCHING. touchCardOpened is what moves the "last seen" mark, so
    the two balances have to be taken first or the diff is always empty and the
    customer is never told they have earned something.
  */
  const seen = await balanceSinceLastOpen(cafe.id, diner.phone);

  // Record the visit so the wallet can sort by "recently opened".
  await touchCardOpened(cafe.id, diner.phone);

  const [program, rewards] = await Promise.all([getLoyaltyProgram(cafe.id), getRewards(cafe.id)]);

  /*
    A reward is worth taking over the screen for only if it crossed the line
    SINCE they last looked. Affordable-now-and-then is old news they have
    already been congratulated for; affordable-now-but-not-then is the moment
    this whole product exists to produce.

    The dearest of the newly reachable, not the cheapest — "tu as gagné un
    brunch complet" is the better sentence, and the cheaper ones are still
    waiting for them on the boutique screen the button leads to.
  */
  const justUnlocked = rewards
    .filter((r) => r.active && r.pointsCost <= seen.now && r.pointsCost > seen.before)
    .sort((a, b) => b.pointsCost - a.pointsCost)[0];
  const offers = [...rewards].sort((a, b) => a.pointsCost - b.pointsCost).slice(0, 3);

  const stampView = stampCardView(diner.stamps, diner.stampsStartedAt, program);

  return (
    <div className="flex flex-1 flex-col pb-6">
      {/* Plays once, over a card that is already rendered and already usable. */}
      {nouveau && <CardArrived cafeName={cafe.name} points={program.welcomePoints ?? 0} />}
      {/* A brand-new card gets CardArrived, never both — balanceSinceLastOpen
          returns an empty diff for a card that has never been opened. */}
      {!nouveau && justUnlocked && (
        <RewardUnlocked
          label={justUnlocked.label}
          imageUrl={justUnlocked.imageUrl}
          href={`/${slug}/boutique`}
        />
      )}
      {/* greeting + points badge */}
      <section className="px-5 pb-5 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-medium leading-tight text-white/70">Bonjour</p>
            <h1 className="truncate text-[26px] font-extrabold leading-tight">
              {diner.name ?? "toi"}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-3.5 py-2 ring-1 ring-white/15">
            <span
              className="grid h-7 w-7 place-items-center rounded-full bg-white/90"
              style={{ color: "var(--cafe)" }}
            >
              <Sparkle className="h-4 w-4" />
            </span>
            <span className="leading-none">
              {/*
                Counts up from the balance at the last visit, so the points
                earned since then are something the customer WATCHES arrive
                rather than something they have to work out. seen.before was
                already being computed and thrown away.
              */}
              <CountUp
                from={seen.before}
                to={diner.balance}
                className="block text-[18px] font-extrabold tabular-nums"
              />
              <span className="block text-[10px] font-semibold text-white/60">points</span>
            </span>
          </div>
        </div>
        <p className="mt-1 text-[13px] text-white/60">Merci pour votre fidélité !</p>
      </section>

      {/* the main card */}
      <div className="px-5">
        {program.stampsEnabled ? (
          <StampCard shown={stampView.shown} expiry={stampView.expiry} program={program} />
        ) : (
          <PointsCard balance={diner.balance} rewards={rewards} rate={program.pointsPerTnd} />
        )}
      </div>

      {/* how you earn: show your number so the counter can find you */}
      <div className="px-5 pt-3">
        <Link
          href={`/${slug}/scanner`}
          className="d-soft flex items-center justify-center gap-2 py-3 text-[13.5px] font-bold text-white active:scale-[0.99]"
        >
          <ScanIcon className="h-[18px] w-[18px]" />
          Montrer mon code au comptoir
        </Link>
      </div>

      {/* stamp reward card */}
      {program.stampsEnabled && (
        <div className="px-5 pt-3">
          <div className="d-card flex items-center gap-3.5 px-4 py-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/12">
              <GiftIcon className="h-5 w-5 text-white" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-white/55">
                Récompense
              </span>
              <span className="block text-[14.5px] font-bold leading-snug text-white line-clamp-2">
                {program.stampReward}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* codes to show at the counter */}
      {diner.codes.length > 0 && (
        <section className="px-5 pt-4">
          {/*
            Deliberately NOT "À montrer au comptoir": the CTA higher up the page
            already says "Montrer mon code au comptoir" about the account code,
            and these are a different thing — expiring reward vouchers.
          */}
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-white/55">
            Récompenses à récupérer
          </p>
          <ul className="stagger space-y-2">
            {diner.codes.map((c, i) => (
              <li
                key={c.code} style={{ ["--i" as string]: i }}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/[0.07] px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold text-white">{c.label}</span>
                  <span className="mt-0.5 block text-[11px] font-medium text-white/55">
                    {expiresIn(c.expiresAt)}
                  </span>
                </span>
                <span className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 font-mono text-[14px] font-bold tracking-[0.14em] text-charcoal">
                  {c.code}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* offers — points always accrue, so this shows in both modes */}
      {offers.length > 0 && (
        <section className="px-5 pt-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-extrabold text-white">Récompenses disponibles</h2>
            <Link href={`/${slug}/boutique`} className="text-[12.5px] font-bold text-white/70">
              Voir tout
            </Link>
          </div>
          <ul className="stagger mt-2.5 space-y-2">
            {offers.map((r, i) => (
              <li key={r.id} style={{ ["--i" as string]: i }}>
                <Link
                  href={`/${slug}/boutique`}
                  className="flex items-center gap-3.5 rounded-2xl border border-white/12 bg-white/[0.06] px-3.5 py-3 active:scale-[0.99]"
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
                    <span className="block text-[12.5px] font-bold text-[#ffd27a]">
                      {r.pointsCost} points 🪙
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * The punch card: dots that fill toward the reward slot.
 *
 * `shown` and `expiry` are computed by the (server) page, not here — what we
 * display has to match what the next stamp will actually do, and that depends on
 * the current time, which a component must not read.
 */
function StampCard({
  shown,
  expiry,
  program,
}: {
  shown: number;
  expiry: string | null;
  program: LoyaltyProgram;
}) {
  const required = program.stampsRequired;
  const remaining = Math.max(0, required - shown);
  const pct = Math.min(100, Math.round((shown / required) * 100));
  const size = required > 10 ? "h-9 w-9" : "h-11 w-11";

  return (
    <div className="d-card px-5 pb-5 pt-6">
      <div className="flex flex-wrap justify-center gap-2.5">
        {Array.from({ length: required }).map((_, i) => {
          const filled = i < shown;
          const isReward = i === required - 1;
          return (
            <span
              key={i}
              className={`grid ${size} place-items-center rounded-full ${filled ? "d-stamp" : "d-stamp--empty"}`}
            >
              {filled ? (
                <Sparkle className="h-5 w-5" />
              ) : isReward ? (
                <GiftIcon className="h-5 w-5" />
              ) : null}
            </span>
          );
        })}
      </div>

      <p className="mt-5 text-center text-[13.5px] font-medium text-white/85">
        {remaining <= 0 ? (
          "Ta récompense t'attend 🎉"
        ) : (
          <>
            Encore <b className="font-extrabold text-white">{remaining} visite{remaining > 1 ? "s" : ""}</b> pour
            votre récompense
          </>
        )}
      </p>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/12">
        <div
          className="h-full rounded-full bg-white transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        {expiry ? (
          <span className="text-[10.5px] font-medium text-white/45">Valable jusqu&apos;au {expiry}</span>
        ) : (
          <span />
        )}
        <span className="text-[11.5px] font-semibold tabular-nums text-white/55">
          {shown} / {required}
        </span>
      </div>
    </div>
  );
}

/** Points mode: progress toward the next reward. */
function PointsCard({
  balance,
  rewards,
  rate,
}: {
  balance: number;
  rewards: Parameters<typeof nextRewardNudge>[1];
  rate: number;
}) {
  const nudge = nextRewardNudge(balance, rewards);
  /*
    Fill the bar from the SAME numbers as its caption (balance / target).
    nudge.progress measures from the previous reward tier, so the bar and the
    "450 / 500" underneath it disagreed — and it contradicted the bar shown for
    the very same reward in /boutique.
  */
  const pct = nudge ? Math.min(100, Math.round((balance / nudge.target.pointsCost) * 100)) : 100;

  return (
    <div className="d-card px-5 pb-5 pt-5">
      <p className="text-[12px] font-semibold text-white/70">Tes points</p>
      <p className="mt-1 flex items-center gap-2.5">
        <span className="text-[52px] font-extrabold leading-none tabular-nums">{fmtPoints(balance)}</span>
        <span
          className="grid h-8 w-8 place-items-center rounded-full bg-white/90"
          style={{ color: "var(--cafe)" }}
        >
          <Sparkle className="h-4 w-4" />
        </span>
      </p>

      {nudge ? (
        <>
          <p className="mt-3 text-[13px] font-medium text-white/90">
            Encore <b>{nudge.needed} points</b> pour {nudge.target.label.toLowerCase()} !
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/12">
            <div className="h-full rounded-full bg-white transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-[11.5px] font-semibold tabular-nums text-white/55">
            {fmtPoints(balance)} / {nudge.target.pointsCost}
          </p>
        </>
      ) : rewards.length > 0 ? (
        <p className="mt-3 text-[13.5px] font-semibold text-white/95">✦ Tu peux t&apos;offrir une récompense.</p>
      ) : (
        <p className="mt-3 text-[13px] font-medium text-white/70">Cumule des points — des offres arrivent bientôt.</p>
      )}

      {/*
        The scale, and the fact that nothing runs out.

        Without the rate, "40 points" is a number with no unit: the first thing
        a customer asks on this screen is whether 40 points is 40 dinars or 4.
        The rate was printed on the owner's Créditer button and on Réglages, and
        reached the customer exactly once — inside a JSON-LD blob no human sees.

        "Ils n'expirent jamais" is a promise, so it is checked, not assumed:
        nothing in the codebase ever writes a ledger row with reason 'expire'.
        If that ever changes this line has to change with it.
      */}
      <p className="mt-3 border-t border-white/10 pt-2.5 text-[11.5px] leading-relaxed text-white/45">
        {rateLabel(rate)}
        {" · Tes points n'expirent jamais."}
      </p>
    </div>
  );
}

/**
 * "1 dinar = 1 point", or "1 dinar = 2 points", or "2 dinars = 1 point".
 *
 * Always phrased from the dinar, because that is the number the customer is
 * about to hand over. A rate below 1 is inverted rather than shown as "0,5
 * point par dinar", which nobody converts in their head at a counter.
 */
function rateLabel(rate: number): string {
  if (!rate || rate <= 0) return "Cumule des points à chaque achat";
  if (rate >= 1) {
    const n = Math.round(rate * 100) / 100;
    return `1 dinar dépensé = ${n} point${n > 1 ? "s" : ""}`;
  }
  const dinars = Math.round((1 / rate) * 10) / 10;
  return `${dinars} dinars dépensés = 1 point`;
}

/**
 * What the stamp card should DISPLAY — which has to match what the next stamp
 * will actually do, so the card never promises the wrong thing:
 *   • a card past its expiry hasn't been reset yet (add_stamp does that on the
 *     next visit) — show it empty, not stale progress with a date in the past;
 *   • a resting card can never look "full": if the owner lowered the requirement
 *     below someone's count, clamp it, or it reads "8 / 5" and announces a
 *     reward that no code was ever issued for.
 */
function stampCardView(
  stamps: number,
  startedAt: string | null,
  program: LoyaltyProgram,
): { shown: number; expiry: string | null } {
  const expiresAt =
    program.stampExpiryDays > 0 && startedAt
      ? new Date(startedAt).getTime() + program.stampExpiryDays * 86_400_000
      : null;
  const lapsed = expiresAt !== null && stamps > 0 && expiresAt < Date.now();
  const shown = lapsed ? 0 : Math.min(stamps, Math.max(0, program.stampsRequired - 1));

  return {
    shown,
    expiry:
      expiresAt !== null && shown > 0 && !lapsed
        ? new Date(expiresAt).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "long",
            // A card valid a year or more out read as a date already past
            // without the year ("12 mars" when it's May).
            ...(new Date(expiresAt).getFullYear() !== new Date().getFullYear()
              ? { year: "numeric" }
              : {}),
          })
        : null,
  };
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
