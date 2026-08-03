import Link from "next/link";
import { CafeClosed } from "@/components/CafeClosed";
import { businessType } from "@/lib/businessTypes";
import { notFound, redirect } from "next/navigation";
import { GiftIcon, ScanIcon } from "@/components/icons";
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

  /* Everything the card face states, computed once, on the server. */
  const type = businessType(cafe.businessType);
  const stampsLeft = Math.max(0, program.stampsRequired - stampView.shown);
  const nudge = nextRewardNudge(diner.balance, rewards);

  return (
    /*
      data-carte is a landmark for the suites, not styling. e2e used to assert
      it had landed here by looking for the words "Tes points" — copy that this
      redesign deleted, so a passing test started failing on a page that works
      perfectly. A test should break when the BEHAVIOUR breaks, never when the
      wording improves. (Second time this session: test-owner was selecting a
      field by its placeholder.)
    */
    <div data-carte className="flex flex-1 flex-col pb-6">
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
      {/*
        ── THE SHOP'S CARD ────────────────────────────────────────────────
        Built to the supplied mockup: a circular shop mark, the name at a size
        you can read across a table, a type pill under it, and the balance on
        the far side of a hairline rule. Then the stamp track, and one row that
        carries the earning rate on the left and the distance to the prize on
        the right.

        Tapping it opens the wallet. The old top bar had a café chip whose job
        was switching cards; the card is a better target for that than a pill
        repeating a name printed 130px below it at four times the size.
      */}
      <section className="px-4 pb-4 pt-1">
        <Link
          href={`/cartes?from=${slug}`}
          aria-label={`${cafe.name} — voir toutes mes cartes`}
          className="block overflow-hidden rounded-[28px] p-5 transition active:scale-[0.99]"
          style={{
            backgroundImage:
              "linear-gradient(150deg, #7c56e8 0%, #6039cf 26%, #3d2483 62%, #241748 100%)",
            boxShadow: "0 24px 50px -20px rgba(101,67,214,.9), inset 0 1px 0 rgba(255,255,255,.22)",
          }}
        >
          <div className="flex items-center gap-4">
            {cafe.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
              <img
                src={cafe.logoUrl}
                alt=""
                data-shop-logo
                className="h-[92px] w-[92px] shrink-0 rounded-full bg-white/15 object-cover ring-1 ring-white/20"
              />
            ) : (
              <span className="grid h-[92px] w-[92px] shrink-0 place-items-center rounded-full bg-white/15 text-[42px] ring-1 ring-white/20">
                {type.emoji}
              </span>
            )}

            <span className="min-w-0 flex-1">
              {/* two lines by design, like the mockup — a shop name is a name,
                  not a label to be squeezed onto one row and truncated */}
              <span className="block text-[27px] font-extrabold leading-[1.05] tracking-[-0.02em] line-clamp-2">
                {cafe.name}
              </span>
              <span className="mt-2 inline-block rounded-full bg-white/20 px-3 py-[3px] text-[12.5px] font-bold text-white">
                {type.label}
              </span>
            </span>

            <span className="h-[74px] w-px shrink-0 bg-white/20" />

            <span className="shrink-0 pl-1 text-center">
              <CountUp
                from={seen.before}
                to={diner.balance}
                className="block text-[42px] font-extrabold leading-none tabular-nums tracking-[-0.03em]"
              />
              <span className="mt-1 block text-[13px] font-bold text-[#c9b8ff]">points</span>
            </span>
          </div>

          {/*
            ONE progress track, and the line under it NAMES THE PRIZE.

            The stamp mechanic used to be told three times over: ten dots, a
            sentence saying how far off it was, and a third card saying what it
            was — so the sentence never named the prize and the prize never said
            how far. Segments, then one line that says both.
          */}
          {program.stampsEnabled ? (
            <>
              <div className="mt-6 flex gap-2">
                {Array.from({ length: program.stampsRequired }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-[13px] flex-1 rounded-full ${
                      i < stampView.shown ? "bg-[#a78bfa]" : "bg-white/[0.13]"
                    }`}
                  />
                ))}
              </div>
              <div className="mt-4 flex items-end justify-between gap-4">
                <span className="shrink-0 whitespace-nowrap text-[11.5px] leading-snug text-white/50">
                  {rateLabel(program.pointsPerTnd)}
                </span>
                <span className="min-w-0 text-right text-[12px] leading-snug text-white/70">
                  {stampsLeft <= 0 ? (
                    <b className="font-extrabold text-white">
                      {program.stampReward} t&apos;attend 🎉
                    </b>
                  ) : (
                    <>
                      Encore{" "}
                      <b className="font-extrabold text-white">
                        {stampsLeft} visite{stampsLeft > 1 ? "s" : ""}
                      </b>{" "}
                      pour <b className="font-extrabold text-[#c9b8ff]">{program.stampReward}</b>
                    </>
                  )}
                </span>
              </div>
            </>
          ) : (
            <>
              {nudge && (
                <span className="mt-6 block h-[13px] overflow-hidden rounded-full bg-white/[0.13]">
                  <span
                    className="block h-full rounded-full bg-[#a78bfa]"
                    style={{
                      width: `${Math.min(100, Math.round((diner.balance / nudge.target.pointsCost) * 100))}%`,
                    }}
                  />
                </span>
              )}
              <div className="mt-4 flex items-end justify-between gap-4">
                <span className="shrink-0 whitespace-nowrap text-[11.5px] leading-snug text-white/50">
                  {rateLabel(program.pointsPerTnd)}
                </span>
                {nudge && (
                  <span className="min-w-0 text-right text-[12px] leading-snug text-white/70">
                    Encore{" "}
                    <b className="font-extrabold text-white">
                      {fmtPoints(nudge.needed)} point{nudge.needed >= 2 ? "s" : ""}
                    </b>{" "}
                    pour <b className="font-extrabold text-[#c9b8ff]">{nudge.target.label}</b>
                  </span>
                )}
              </div>
            </>
          )}
        </Link>
      </section>

      {/* the one thing you do here, and what it is for */}
      <div className="px-4">
        <Link
          href={`/${slug}/scanner`}
          className="flex items-center justify-center gap-3.5 rounded-[24px] bg-white px-5 py-4 text-[#150d2b] shadow-[0_16px_38px_-16px_rgba(0,0,0,.85)] transition active:scale-[0.99]"
        >
          <ScanIcon className="h-8 w-8 shrink-0" />
          <span className="text-left">
            <span className="block text-[18px] font-extrabold leading-tight">Montrer mon code</span>
            <span className="block text-[13px] font-medium text-[#150d2b]/50">
              Scannez en caisse
            </span>
          </span>
        </Link>
      </div>

      {/* codes to show at the counter */}
      {diner.codes.length > 0 && (
        <section className="px-4 pt-5">
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

      {/*
        ── MES RÉCOMPENSES ────────────────────────────────────────────────
        The mockup's row: a white tile carrying the shop's own artwork, the
        name, and the cost in a tinted box on the right.

        The cost box also carries the ANSWER, which the mockup could not know:
        it goes green when the balance already covers it. A customer holding 219
        points was being shown "60 points · 70 points · 90 points" — three
        things they could have had that morning — and left to do the subtraction
        themselves. Colour is doing work here, not decoration.
      */}
      {offers.length > 0 && (
        <section className="px-4 pt-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[17px] font-extrabold text-white">Mes récompenses</h2>
            <Link href={`/${slug}/boutique`} className="text-[13.5px] font-bold text-[#a78bfa]">
              Voir tout
            </Link>
          </div>

          <ul className="stagger space-y-3">
            {offers.map((r, i) => {
              const ready = diner.balance >= r.pointsCost;
              return (
                <li key={r.id} style={{ ["--i" as string]: i }}>
                  <Link
                    href={`/${slug}/boutique`}
                    className="flex items-center gap-4 rounded-[22px] border border-white/[0.08] bg-white/[0.035] p-3 transition active:scale-[0.99]"
                  >
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
                      <img
                        src={r.imageUrl}
                        alt=""
                        className="h-[62px] w-[62px] shrink-0 rounded-2xl bg-white object-cover"
                      />
                    ) : (
                      <span className="grid h-[62px] w-[62px] shrink-0 place-items-center rounded-2xl bg-white">
                        <GiftIcon className="h-7 w-7 text-[#5b3fd1]" />
                      </span>
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-extrabold text-white">
                        {r.label}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] font-medium text-white/45">
                        {ready ? "Tu peux la prendre" : `Encore ${fmtPoints(r.pointsCost - diner.balance)}`}
                      </span>
                    </span>

                    <span
                      className={`grid shrink-0 place-items-center rounded-2xl px-3.5 py-2.5 text-center ${
                        ready ? "bg-[#7ff0b0]/15 ring-1 ring-[#7ff0b0]/40" : "bg-[#7c56e8]/22"
                      }`}
                    >
                      <span
                        className={`block text-[20px] font-extrabold leading-none tabular-nums ${
                          ready ? "text-[#7ff0b0]" : "text-white"
                        }`}
                      >
                        {fmtPoints(r.pointsCost)}
                      </span>
                      <span
                        className={`mt-0.5 block text-[11px] font-bold ${
                          ready ? "text-[#7ff0b0]/75" : "text-[#c9b8ff]"
                        }`}
                      >
                        points
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}


/*
  StampCard and PointsCard are gone, absorbed into the shop's card above.

  They were two separate boxes drawing the same idea — "how far from the next
  thing" — and only one could ever be on screen, so the page carried a branch
  and two implementations to render one line. The stamp version also told the
  story three times (dots, a sentence, and a third card naming the prize) while
  the points version repeated a bar the wallet already draws. One progress line
  on the card, naming the prize, replaces both.
*/
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
