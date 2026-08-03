import Link from "next/link";
import { CafeClosed } from "@/components/CafeClosed";
import { businessType } from "@/lib/businessTypes";
import { notFound, redirect } from "next/navigation";
import { GiftIcon, ScanIcon, Sparkle } from "@/components/icons";
import { getCafe, getLoyaltyProgram, getMember, getRewards, nextRewardNudge } from "@/lib/data";
import { balanceSinceLastOpen, dinerWallet } from "@/lib/db";
import type { LoyaltyProgram } from "@/lib/types";
import { CardArrived } from "@/components/CardArrived";
import { CountUp } from "@/components/CountUp";
import { RewardUnlocked } from "@/components/RewardUnlocked";
import { MarkOpened } from "@/components/MarkOpened";
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

  /*
    The mark is NOT moved here any more — <MarkOpened> does it from the browser,
    after paint. A write during render runs however many times Next decides to
    render, and an invisible pass was spending the unlock window before the
    diner ever saw the page. See markCardOpenedAction.
  */

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
  /* Rewards this balance already covers — the number the boutique tab
     cannot show, and the only reason to look at that tile. */
  const readyCount = rewards.filter((r) => r.active && r.pointsCost <= diner.balance).length;
  /* How many shops this person carries — the wallet tile's whole point, and a
     number the header pill cannot show. One query, already indexed by phone. */
  const cardCount = (await dinerWallet(diner.phone)).length;

  /* The code the cashier scans, drawn HERE rather than one tap away. Encodes the
     ACCOUNT code, never the phone number — same as /scanner did. */
  const qr = await QRCode.toString(diner.code, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    /* Dark modules now, not white: the code sits on the ticket's white pass
       zone, which is also the polarity the QR spec actually promises decoders
       will read. The old white-on-dark worked, but this one cannot not-work. */
    color: { dark: "#1a1128", light: "#00000000" },
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
    /* Top-anchored, not justify-center: centring was invisible while this
       screen held three stacked blocks, but the single compact ticket floated
       to mid-screen with a dead band above it the moment the page got short.
       The ticket is the object of this screen — it sits where the eye starts. */
    <div data-carte className="flex flex-1 flex-col pb-6">
      <MarkOpened slug={slug} />
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
        {/*
          ONE TICKET, NOT TWO CARDS.

          The QR used to sit under the card as a second bordered block of almost
          equal weight — two surfaces stacked, neither winning, nothing shared.
          Now the whole thing is one boarding pass: the loyalty card on top, a
          perforated line with two notches punched out of the sides, and the
          code in a white pass zone at the bottom of the SAME container.

          The notches are a CSS mask (.ticket-notch), not painted circles — the
          page behind is a gradient, so a painted "hole" would be the wrong
          colour at every scroll position except one.
        */}
        <div
          className="ticket-notch relative overflow-hidden rounded-[28px]"
          style={{
            backgroundImage:
              "linear-gradient(150deg, #7c56e8 0%, #6039cf 26%, #3d2483 62%, #241748 100%)",
            boxShadow: "0 24px 50px -20px rgba(101,67,214,.9), inset 0 1px 0 rgba(255,255,255,.22)",
          }}
        >
          {/* one diagonal light pass when the card mounts — see .card-sheen */}
          <span aria-hidden className="card-sheen" />

        <Link
          href={`/cartes?from=${slug}`}
          aria-label={`${cafe.name} — voir toutes mes cartes`}
          className="block p-5 pb-4 transition active:opacity-90"
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
              {/*
                A WELL, NOT LOOSE DOTS. The grid alone spread its columns across
                the full card width, so the dots floated in empty purple — the
                "scattered" look. w-fit makes the grid hug its dots, the darker
                inset ties them together as one object, and mx-auto centres that
                object. The dots stopped floating because they are IN something.
              */}
              <div className="mx-auto mt-4 w-fit rounded-2xl bg-black/[0.18] px-3.5 py-2.5">
                <div
                  className="grid gap-1.5"
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
                        className={`grid h-7 w-7 place-items-center rounded-full ${
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

          {/* The rate, a footnote — the perforation below is the separator now,
              so the border-t this line used to carry is gone. */}
          <p className="mt-2.5 text-[10.5px] font-medium text-white/35">
            {rateLabel(program.pointsPerTnd)}
          </p>
        </Link>

        {/* ── the perforation ─────────────────────────────────────────
            The dashed line sits exactly on the notch centres (--pass-h in
            .ticket-notch). Above it: the card. Below it: the pass. */}
        <div aria-hidden className="mx-4 border-t-2 border-dashed border-white/20" />

        {/*
          ── THE PASS ZONE ────────────────────────────────────────────
          The code itself, not a button to go and get it: the card screen IS
          the screen someone has open when they reach the till, and one more
          tap while a queue waits was a tap for nothing. /scanner still exists
          for the bottom nav and deep links.

          White, inside the same ticket — the QR small on the left, the code
          readable ACROSS a counter on the right for when a camera won't focus.
          h-[128px] is load-bearing: it is what .ticket-notch's --pass-h aligns
          the notches to. Change one, change both.
        */}
        <div className="flex h-[128px] items-center gap-4 bg-white px-5">
          <div
            className="w-[92px] shrink-0 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#17121f]/45">
              Mon code client
            </p>
            <p className="mt-1 font-mono text-[30px] font-extrabold leading-none tracking-[0.14em] text-[#4c2fd6]">
              {diner.code}
            </p>
            <p className="mt-1.5 text-[11.5px] leading-snug text-[#17121f]/55">
              Le serveur le scanne — pas besoin de ton numéro.
            </p>
          </div>
        </div>
        </div>
      </section>


      {/*
        ── FOUR SHORTCUTS, UNDER THE TICKET ───────────────────────────────
        The ticket ends a third of the way down and left a dead band above the
        tab bar. Filling it with links to the tabs would be the clutter this
        screen just had removed, so each tile carries a LIVE NUMBER the tab bar
        cannot: how many rewards are within reach right now, how many codes are
        waiting, how many visits are on record. That is the difference between
        a shortcut and a second navigation.

        Sized to leave the page exactly one screen — measured at 390×844, no
        scroll. Two columns, because four in a row puts a 9px label under a
        20px icon and nobody reads it.
      */}
      <section className="mt-4 grid grid-cols-2 gap-2.5 px-4">
        <Tile
          href={`/${slug}/boutique`}
          label="Récompenses"
          value={
            readyCount > 0
              ? `${readyCount} à prendre`
              : nudge
                ? `encore ${fmtPoints(nudge.needed)}`
                : "à découvrir"
          }
          accent={readyCount > 0}
          icon={<GiftIcon className="h-[19px] w-[19px]" />}
        />
        <Tile
          href={`/${slug}/codes`}
          label="Mes codes"
          value={
            diner.codes.length > 0
              ? `${diner.codes.length} à récupérer`
              : "aucun"
          }
          accent={diner.codes.length > 0}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
              <rect x="3" y="7" width="18" height="12" rx="2.5" />
              <path d="M7 11h4M7 15h2" />
            </svg>
          }
        />
        <Tile
          href={`/${slug}/historique`}
          label="Historique"
          value="mes points"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          }
        />
        <Tile
          href={`/${slug}/profil`}
          label="Mon profil"
          value={diner.name ?? "mon compte"}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
              <circle cx="12" cy="8" r="3.4" />
              <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
            </svg>
          }
        />
      </section>

      {/* Full width, because it leaves this shop rather than going deeper into
          it — and because the wallet otherwise exists only as a pill in the
          header, which is the one place a first-timer does not look. */}
      <div className="mt-2.5 px-4">
        <Tile
          href={`/cartes?from=${slug}`}
          label="Mes cartes"
          value={`${cardCount} boutique${cardCount > 1 ? "s" : ""}`}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
              <rect x="2.5" y="7.5" width="15" height="11" rx="2.5" />
              <path d="M6.5 5.5h13a2 2 0 0 1 2 2v9" />
            </svg>
          }
        />
      </div>
    </div>
  );
}

/**
 * One shortcut.
 *
 * `accent` is not decoration — it lights only when the tile has something
 * waiting behind it (a reward you can take today, a code to collect), so the
 * grid reads at a glance instead of being four identical boxes.
 */
function Tile({
  href,
  label,
  value,
  icon,
  accent = false,
}: {
  href: string;
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-[20px] border px-3.5 py-3 transition active:scale-[0.98] ${
        accent
          ? "border-[#7ff0b0]/30 bg-[#7ff0b0]/[0.07]"
          : "border-white/[0.08] bg-white/[0.035]"
      }`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
          accent ? "bg-[#7ff0b0]/15 text-[#7ff0b0]" : "bg-white/[0.07] text-[#a78bfa]"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-extrabold text-white">{label}</span>
        <span
          className={`block truncate text-[11px] font-medium ${
            accent ? "text-[#7ff0b0]/80" : "text-white/45"
          }`}
        >
          {value}
        </span>
      </span>
    </Link>
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
