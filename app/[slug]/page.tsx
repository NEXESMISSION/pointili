import Link from "next/link";
import { CafeClosed } from "@/components/CafeClosed";
import { businessType } from "@/lib/businessTypes";
import { notFound, redirect } from "next/navigation";
import { GiftIcon, ScanIcon, Sparkle } from "@/components/icons";
import { getCafe, getLoyaltyProgram, getMember, getRewards, nextRewardNudge } from "@/lib/data";
import { balanceSinceLastOpen, touchCardOpened } from "@/lib/db";
import type { LoyaltyProgram } from "@/lib/types";
import { CardArrived } from "@/components/CardArrived";
import { CountUp } from "@/components/CountUp";
import { RewardUnlocked } from "@/components/RewardUnlocked";
import { fmtPoints } from "@/lib/points";
import QRCode from "qrcode";

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

  const stampView = stampCardView(diner.stamps, diner.stampsStartedAt, program);

  /* Everything the card face states, computed once, on the server. */
  const type = businessType(cafe.businessType);
  const stampsLeft = Math.max(0, program.stampsRequired - stampView.shown);
  const nudge = nextRewardNudge(diner.balance, rewards);

  /* The code the cashier scans, drawn HERE rather than one tap away. Encodes the
     ACCOUNT code, never the phone number — same as /scanner did. */
  const qr = await QRCode.toString(diner.code, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#ffffff", light: "#00000000" },
  });

  return (
    /*
      data-carte is a landmark for the suites, not styling. e2e used to assert
      it had landed here by looking for the words "Tes points" — copy that this
      redesign deleted, so a passing test started failing on a page that works
      perfectly. A test should break when the BEHAVIOUR breaks, never when the
      wording improves. (Second time this session: test-owner was selecting a
      field by its placeholder.)
    */
    /*
      justify-center, now that the page is a card and a button.

      With the rewards list gone the content stops about a third of the way
      down, and everything crammed against the top over 400px of nothing reads
      as a screen that failed to finish loading. Centred, the same two elements
      read as all there is — which is the point.
    */
    <div data-carte className="flex flex-1 flex-col justify-center pb-6">
      {/*
        Plays once, over a card that is already rendered and already usable.

        THE TRIGGER IS THE CARD, NOT THE URL. This used to be `nouveau` alone —
        a ?nouveau=1 flag set by the join action — which meant the arrival was
        tied to the act of joining rather than to a card actually being new:

          · signed up here            → played  ✓
          · joined a second shop      → played  ✓
          · a cashier credited you as a walk-in and made your card FOR you,
            and you opened it later   → NEVER played  ✗
          · re-joined a shop you were already in → played anyway, with nothing
            added                                 ✗

        seen.firstOpen is diner_cafes.last_opened_at being null, which is true
        exactly once per card no matter how the card came to exist. `nouveau` is
        kept as well: on the join path the row is stamped in the same request,
        so the flag is what covers that one race.
      */}
      {(nouveau || seen.firstOpen) && (
        <CardArrived cafeName={cafe.name} points={program.welcomePoints ?? 0} />
      )}
      {/* A brand-new card gets CardArrived, never both — balanceSinceLastOpen
          returns an empty diff for a card that has never been opened. */}
      {!nouveau && !seen.firstOpen && justUnlocked && (
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
          {/*
            SIZED DOWN, HARD.

            This row used to be a 78px logo beside a 29px name allowed to run to
            two lines, beside a 48px number — three things all shouting, and on a
            390px screen the name wrapped, the divider stretched, and the whole
            card became a wall. The wallet's own card row says the same four
            facts in a third of the height, which is why it reads better; this
            now follows it. Nothing was removed — it just stopped competing.
          */}
          <div className="flex items-center gap-3.5">
            {cafe.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
              <img
                src={cafe.logoUrl}
                alt=""
                data-shop-logo
                className="h-[52px] w-[52px] shrink-0 rounded-full bg-white/15 object-cover ring-1 ring-white/20"
              />
            ) : (
              <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-white/15 text-[21px] ring-1 ring-white/20">
                {type.emoji}
              </span>
            )}

            <span className="min-w-0 flex-1">
              {/* ONE line now. A name that needs two lines gets an ellipsis —
                  better than a card whose height depends on the shop's name. */}
              <span className="block truncate text-[17px] font-extrabold leading-tight tracking-[-0.015em]">
                {cafe.name}
              </span>
              <span className="mt-1 inline-block rounded-full bg-white/20 px-2.5 py-[2px] text-[11px] font-bold text-white">
                {type.label}
              </span>
            </span>

            <span className="shrink-0 text-right">
              <CountUp
                from={seen.before}
                to={diner.balance}
                className="block text-[28px] font-extrabold leading-none tabular-nums tracking-[-0.03em]"
              />
              <span className="mt-0.5 block text-[11.5px] font-bold text-[#c9b8ff]">points</span>
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
              {/*
                Circles, not bars. A punch card is round holes in card stock and
                that is the whole reason the mechanic reads without a caption —
                the bar version was tidier and said "progress", which is what
                every bar says. The gift in the last slot is the prize sitting
                at the end of the row where you can see it coming.
              */}
              {/*
                A GRID, NOT A WRAP.

                `flex-wrap justify-center` left the last row centred under a full
                one — ten stamps came out as seven and three, floating, which is
                the ragged block in the screenshot. A grid with a fixed column
                count fills evenly: ten becomes two rows of five, twelve becomes
                two of six. Same dots, no raggedness.
              */}
              <div
                className="mt-5 grid justify-items-center gap-2"
                style={{
                  gridTemplateColumns: `repeat(${
                    program.stampsRequired > 6
                      ? Math.ceil(program.stampsRequired / 2)
                      : program.stampsRequired
                  }, minmax(0, 1fr))`,
                }}
              >
                {Array.from({ length: program.stampsRequired }).map((_, i) => {
                  const filled = i < stampView.shown;
                  const isReward = i === program.stampsRequired - 1;
                  return (
                    <span
                      key={i}
                      /* FIXED size, centred in its cell. `aspect-square w-full`
                         made each dot as wide as its column — five columns on a
                         390px card gave 64px circles that swallowed the card. */
                      className={`grid h-8 w-8 place-items-center rounded-full ${
                        filled
                          ? "bg-white text-[#5b3fd1]"
                          : "border border-dashed border-white/30 text-white/35"
                      }`}
                    >
                      {filled ? (
                        <Sparkle className="h-3.5 w-3.5" />
                      ) : isReward ? (
                        <GiftIcon className="h-3.5 w-3.5" />
                      ) : null}
                    </span>
                  );
                })}
              </div>

              {/* One line, and it wraps as prose instead of as two columns
                  fighting over a 390px row — which is what produced the three
                  ragged right-aligned lines. */}
              <p className="mt-3.5 text-[12.5px] leading-snug text-white/60">
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
              </p>
            </>
          ) : (
            <>
              {nudge && (
                <span className="mt-5 block h-[9px] overflow-hidden rounded-full bg-white/[0.13]">
                  <span
                    className="block h-full rounded-full bg-[#a78bfa]"
                    style={{
                      width: `${Math.min(100, Math.round((diner.balance / nudge.target.pointsCost) * 100))}%`,
                    }}
                  />
                </span>
              )}
              {nudge && (
                <p className="mt-3 text-[12.5px] leading-snug text-white/60">
                  Encore{" "}
                  <b className="font-extrabold text-white">
                    {fmtPoints(nudge.needed)} point{nudge.needed >= 2 ? "s" : ""}
                  </b>{" "}
                  pour <b className="font-extrabold text-[#c9b8ff]">{nudge.target.label}</b>
                </p>
              )}
            </>
          )}

          {/* The rate, once, quietly, at the foot of the card — where it is a
              footnote rather than one half of a two-column row that wrapped. */}
          <p className="mt-3 border-t border-white/12 pt-2.5 text-[11px] font-medium text-white/40">
            {rateLabel(program.pointsPerTnd)}
          </p>
        </Link>
      </section>

      {/* the one thing you do here, and what it is for */}
      <div className="px-4">
        {/*
          THE CODE ITSELF, not a button to go and get it.

          This was a white "Montrer mon code" bar that opened /scanner. But the
          card screen IS the screen someone has open when they reach the till,
          and making them tap once more — while a queue waits and a cashier
          holds out a phone — was a tap for nothing. /scanner still exists for
          the deep link and the bottom nav; this is the same code, in the place
          it is actually needed.
        */}
        <div className="rounded-[24px] border border-white/[0.10] bg-white/[0.04] px-5 pb-4 pt-5 text-center">
          <div className="mx-auto w-[150px] [&>svg]:h-auto [&>svg]:w-full">
            <div dangerouslySetInnerHTML={{ __html: qr }} />
          </div>
          <p className="mt-4 text-[10.5px] font-bold uppercase tracking-[0.10em] text-white/45">
            Mon code client
          </p>
          {/* Readable ACROSS a counter, for when a camera will not focus. */}
          <p className="mt-1 font-mono text-[26px] font-extrabold leading-none tracking-[0.16em] text-[#a78bfa]">
            {diner.code}
          </p>
          <p className="mt-2 text-[11.5px] text-white/45">
            Le serveur le scanne — pas besoin de ton numéro.
          </p>
        </div>
      </div>


      {/*
        THE REWARDS LIST IS GONE FROM THIS SCREEN.

        It sat under the code button showing three of them, with a "Voir
        tout" leading exactly where the RÉCOMPENSES tab now leads — a whole
        section duplicating a tab two centimetres below it.

        This screen answers one question, "how am I doing here", and offers
        the one action anyone takes at a counter. Choosing a reward belongs on
        the screen named after them.
      */}
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

/*
  expiresIn() lived here and counted a code down to its deadline. Codes have no
  deadline any more (0031), so it had nothing left to count and every string it
  returned would have been a lie. Deleted rather than left dark.
*/
