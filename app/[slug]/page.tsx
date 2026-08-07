import Link from "next/link";
import { CafeClosed } from "@/components/CafeClosed";
import { businessType } from "@/lib/businessTypes";
import { notFound, redirect } from "next/navigation";
import { GiftIcon, Sparkle, UserIcon } from "@/components/icons";
import { getCafe, getLoyaltyProgram, getMember, getRewards, nextRewardNudge } from "@/lib/data";
import { balanceSinceLastOpen, dinerWallet } from "@/lib/db";
import type { LoyaltyProgram } from "@/lib/types";
import { CardArrived } from "@/components/CardArrived";
import { CountUp } from "@/components/CountUp";
import { RewardUnlocked } from "@/components/RewardUnlocked";
import { MarkOpened } from "@/components/MarkOpened";
import { fmtPoints } from "@/lib/points";
import { codeQr } from "@/lib/qr";
import { inkOn, safeColor } from "@/lib/theme";

/**
 * Ma carte — the shop's own card, in the shop's own colour.
 *
 * ONE COLOURED BANNER, THEN WHITE. The screen used to be a deep-purple ticket on
 * a deep-purple page: our brand, handed to every boulangerie and barber in the
 * country with their logo shrunk into the corner of it. Now the top of the
 * screen is theirs — their colour, their logo, their name, and the balance they
 * are keeping — and everything under it is white and quiet.
 *
 * The order is what a person actually does, top to bottom:
 *   1. the banner       who this is and what I have
 *   2. the code         what the cashier scans — no tap, ever
 *   3. what is waiting  a reward already bought, or one now within reach
 *   4. the rest         codes, history
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
  /* The wallet, for the switcher in the banner — the other shops' marks are
     what make it read as a control with something behind it. One indexed RPC,
     in parallel with the three it already ran.

     `seen` is IN this group rather than awaited before it: it depends on
     nothing the others produce, and standing in front of them added its own
     round trip to the slowest screen in the product for no reason. */
  const [seen, program, rewards, wallet] = await Promise.all([
    balanceSinceLastOpen(cafe.id, diner.phone),
    getLoyaltyProgram(cafe.id),
    getRewards(cafe.id),
    dinerWallet(diner.phone),
  ]);
  /* Up to three OTHER shops: this one is already the whole screen. */
  const others = wallet.filter((c) => c.slug !== slug).slice(0, 3);

  /*
    A reward is worth taking over the screen for only if it crossed the line
    SINCE they last looked. Affordable-now-and-then is old news they have
    already been congratulated for; affordable-now-but-not-then is the moment
    this whole product exists to produce.
  */
  const justUnlocked = rewards
    .filter((r) => r.active && r.pointsCost <= seen.now && r.pointsCost > seen.before)
    .sort((a, b) => b.pointsCost - a.pointsCost)[0];

  const stampView = stampCardView(diner.stamps, diner.stampsStartedAt, program);
  const type = businessType(cafe.businessType);
  const stampsLeft = Math.max(0, program.stampsRequired - stampView.shown);
  const nudge = nextRewardNudge(diner.balance, rewards);
  const readyCount = rewards.filter((r) => r.active && r.pointsCost <= diner.balance).length;
  const pending = diner.codes.length;
  /* Cheapest first — the row is read left to right and the first card should be
     the one they can nearly afford, not the one they cannot. */
  const ladder = rewards.filter((r) => r.active).sort((a, b) => a.pointsCost - b.pointsCost);

  /* The code the cashier scans, drawn HERE rather than one tap away — this is
     the screen someone has open when they reach the till. Encodes the ACCOUNT
     code, never the phone number. */
  const qr = await codeQr(diner.code);

  /*
    The banner's dress.

    `photo` is only honoured when a photograph has actually been saved —
    theme.coverAt is what proves that, and it doubles as the cache key on the
    URL. A shop that chose photo and then removed the picture falls back to the
    gradient rather than to a black rectangle.

    The bytes are NOT here: /api/cover serves them with a year-long cache (see
    that route). This page emits a forty-character URL.
  */
  const theme = cafe.designSettings.theme;
  const coverUrl =
    theme.banner === "photo" && theme.coverAt
      ? `/api/cover/${slug}?v=${encodeURIComponent(theme.coverAt)}`
      : null;
  /* photo · flat · gradient, plus the two switches the shop owns: whether the
     banner curves into the page, and whether a photograph gets darkened. */
  const bannerClass = [
    coverUrl ? "d-banner--photo" : theme.banner === "flat" ? "d-banner--flat" : "",
    coverUrl && !theme.scrim ? "d-banner--bare" : "",
    theme.bannerRound ? "rounded-b-[30px]" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    /* data-carte is a landmark for the suites, not styling — a test should break
       when the BEHAVIOUR breaks, never when the wording improves. */
    <div data-carte className="flex flex-1 flex-col pb-6">
      <MarkOpened slug={slug} />
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

      {/* ══ THE BANNER — the shop's, not ours ═══════════════════════════
          Flat, a gradient off their own colour, or their photograph. The photo
          is a background-image rather than an <img> because it is a SURFACE,
          not content: nothing should announce it to a screen reader, and it has
          to sit under the scrim that keeps the name and the balance legible. */}
      <section
        className={`d-banner ${bannerClass} safe-t relative overflow-hidden px-5 pb-14 [--safe-pt:0.75rem]`}
        style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
      >
        {/*
          The header lives INSIDE the colour.

          It is the same three controls the other screens carry in a white bar
          (profile, card switcher, bell) — but stacking a white strip above a
          coloured banner put two rows of chrome on the one screen that should
          open with the shop's name. TopBar returns null here for that reason.

          It goes away at lg, where the rail already IS these three controls —
          profile, wallet, activity — permanently, in the same window. Two
          copies of the same navigation a hundred pixels apart is not a
          shortcut, it is a question about which one is the real one.
        */}
        <header className="flex items-center justify-between gap-2 lg:hidden">
          <Link
            href={`/${slug}/profil`}
            aria-label="Mon profil"
            className="grid h-10 w-10 place-items-center rounded-full transition active:scale-95"
            style={{ background: "color-mix(in oklab, var(--cafe-ink) 14%, transparent)" }}
          >
            <UserIcon className="h-[21px] w-[21px]" />
          </Link>

          {/*
            THE SWITCHER SHOWS THE CARDS IT SWITCHES TO.

            It was a small pill reading "Mes cartes ⌄" — a label, sitting on a
            screen that never says how many cards you have or what they are, so
            nothing about it suggested there was anything behind it. Somebody
            with three shops had no reason to press it.

            Now it carries the actual wallet: the other shops' marks, stacked
            and overlapping the way cards do in a hand, with the count. It is
            wider (it takes the room the header had going spare), it is a real
            object rather than a caption, and it fans out once on arrival —
            once, because a control that moves forever in the corner of the eye
            is an advert. See .fan-in.
          */}
          <Link
            href={`/cartes?from=${slug}`}
            aria-label={`Mes cartes — ${wallet.length} boutique${wallet.length > 1 ? "s" : ""}`}
            className="flex min-w-0 flex-1 items-center justify-center gap-2.5 rounded-full py-2 pl-3 pr-3.5 transition active:scale-[0.97]"
            style={{ background: "color-mix(in oklab, var(--cafe-ink) 15%, transparent)" }}
          >
            {others.length > 0 && (
              <span className="flex shrink-0 -space-x-2.5">
                {others.map((c, i) => (
                  <span
                    key={c.businessId}
                    className="fan-in grid h-7 w-7 place-items-center overflow-hidden rounded-full text-[12px] font-extrabold"
                    style={{
                      background: safeColor(c.primaryColor),
                      color: inkOn(safeColor(c.primaryColor)),
                      boxShadow: "0 0 0 2px var(--cafe)",
                      zIndex: others.length - i,
                      ["--fan" as string]: String(i),
                    }}
                  >
                    {c.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
                      <img src={c.logoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      businessType(c.businessType).emoji
                    )}
                  </span>
                ))}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[14.5px] font-extrabold leading-tight">
                Mes cartes
              </span>
              <span className="block text-[11px] font-semibold leading-tight opacity-75">
                {wallet.length} boutique{wallet.length > 1 ? "s" : ""}
              </span>
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 opacity-80" aria-hidden>
              <path d="m9 6 6 6-6 6" />
            </svg>
          </Link>

          <Link
            href={`/${slug}/historique`}
            aria-label={
              pending > 0 ? `${pending} récompense${pending > 1 ? "s" : ""} à récupérer` : "Mes codes"
            }
            className="relative grid h-10 w-10 place-items-center rounded-full transition active:scale-95"
            style={{ background: "color-mix(in oklab, var(--cafe-ink) 14%, transparent)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[21px] w-[21px]" aria-hidden>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {pending > 0 && (
              /* white dot, ringed in the banner's own colour — it has to read on
                 whatever hue the shop chose */
              <span
                className="absolute right-[8px] top-[7px] h-[10px] w-[10px] rounded-full"
                style={{ background: "var(--cafe-ink)", boxShadow: "0 0 0 2px var(--cafe)" }}
              />
            )}
          </Link>
        </header>

        {/* who — the shop at the size a shop deserves on its own card */}
        <div className="mt-5 flex items-center gap-3">
          {cafe.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
            <img
              src={cafe.logoUrl}
              alt=""
              data-shop-logo
              className="h-[46px] w-[46px] shrink-0 rounded-full object-cover"
              style={{ boxShadow: "0 0 0 2px color-mix(in oklab, var(--cafe-ink) 28%, transparent)" }}
            />
          ) : (
            <span
              className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full text-[20px]"
              style={{ background: "color-mix(in oklab, var(--cafe-ink) 16%, transparent)" }}
            >
              <span className="shop-mark">{type.emoji}</span>
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-[18px] font-extrabold leading-tight tracking-[-0.015em]">
              {cafe.name}
            </span>
            <span className="block text-[12px] font-semibold opacity-70">{type.label}</span>
          </span>
        </div>

        {/* what I have — the one number this screen exists to show */}
        <div className="mt-6 flex items-end gap-2">
          <CountUp
            from={seen.before}
            to={diner.balance}
            className="text-[52px] font-extrabold leading-[0.9] tabular-nums tracking-[-0.04em]"
          />
          <span className="pb-1.5 text-[15px] font-bold opacity-75">points</span>
        </div>

        {/*
          ── HOW FAR, FOR EVERY CURRENCY THE SHOP RUNS ──────────────────
          The two mechanics used to be an either/or: with stamps switched on,
          the points nudge was not rendered at all. So a customer looked at
          "121 points" and then at a stamp track counting toward a DIFFERENT
          reward, and nothing on the screen said what the points were near —
          while the card below it said "3 récompenses à ta portée".

          Both, when both exist. The points line is the primary one (it is the
          number in 52px directly above), the stamp track follows.
        */}
        {nudge ? (
          <div className="mt-5">
            <span
              className="block h-[7px] overflow-hidden rounded-full"
              style={{ background: "color-mix(in oklab, var(--cafe-ink) 20%, transparent)" }}
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.round((diner.balance / nudge.target.pointsCost) * 100))}%`,
                  background: "var(--cafe-ink)",
                }}
              />
            </span>
            <p className="mt-2.5 text-[12.5px] leading-snug opacity-85">
              Encore{" "}
              <b className="font-extrabold">
                {fmtPoints(nudge.needed)} point{nudge.needed >= 2 ? "s" : ""}
              </b>{" "}
              pour <b className="font-extrabold">{nudge.target.label}</b>
            </p>
          </div>
        ) : readyCount > 0 ? (
          /* Nothing left to save for — say THAT rather than falling through to
             the earning rate, which reads as a shrug when you can already
             afford the best thing on the menu. */
          <p className="mt-5 text-[12.5px] leading-snug opacity-85">
            Tu peux prendre <b className="font-extrabold">n&apos;importe quelle récompense</b> ici.
          </p>
        ) : (
          <p className="mt-5 text-[12.5px] leading-snug opacity-85">{rateLabel(program.pointsPerTnd)}</p>
        )}

        {/*
          The stamp card, when the shop runs one — a second, slower mechanic
          under the first, never instead of it.

          STACKED, NOT SIDE BY SIDE. The dots and the sentence shared a row, and
          a ten-stamp card takes the whole width — so the text was squeezed into
          a 70px column and wrapped one word per line: "10 / visites / pour /
          express / for free". The dots are a picture and the sentence is a
          caption; a caption goes underneath.
        */}
        {program.stampsEnabled && (
          <div className="mt-4">
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: program.stampsRequired }).map((_, i) => {
                const filled = i < stampView.shown;
                const isReward = i === program.stampsRequired - 1;
                return (
                  <span
                    key={i}
                    className="grid h-[22px] w-[22px] place-items-center rounded-full"
                    style={
                      filled
                        ? { background: "var(--cafe-ink)", color: "var(--cafe)" }
                        : {
                            border: "1px dashed color-mix(in oklab, var(--cafe-ink) 45%, transparent)",
                            color: "color-mix(in oklab, var(--cafe-ink) 55%, transparent)",
                          }
                    }
                  >
                    {filled ? (
                      <Sparkle className="h-[11px] w-[11px]" />
                    ) : isReward ? (
                      <GiftIcon className="h-[11px] w-[11px]" />
                    ) : null}
                  </span>
                );
              })}
            </div>
            <p className="mt-2 text-[11.5px] leading-snug opacity-80">
              {stampsLeft <= 0 ? (
                <b className="font-extrabold">{program.stampReward} t&apos;attend 🎉</b>
              ) : (
                <>
                  {stampsLeft} visite{stampsLeft > 1 ? "s" : ""} pour{" "}
                  <b className="font-extrabold">{program.stampReward}</b>
                </>
              )}
            </p>
          </div>
        )}
      </section>

      {/* ══ THE CODE — riding up over the banner's edge ══════════════════
          Overlapping is not decoration: it ties the pass to the card it belongs
          to, and it puts the one scannable thing on this screen at the exact
          height a thumb rests. No tap — a queue is waiting. */}
      {/* relative z-10 is load-bearing: the banner above is positioned, so
          without it the banner's rounded corner paints OVER the top of this
          card and clips the QR. */}
      <section className="relative z-10 -mt-9 px-4">
        <div className="d-card flex items-center gap-4 px-4 py-4">
          {/* .d-pass keeps its own white on the dark theme — see globals. The QR
              is dark-on-light or it is not scannable. */}
          <div
            className="d-pass w-[98px] shrink-0 p-1.5 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate">
              Mon code client
            </p>
            <p
              className="mt-1 font-mono text-[30px] font-extrabold leading-none tracking-[0.14em]"
              style={{ color: "var(--cafe-text)" }}
            >
              {diner.code}
            </p>
            <p className="mt-1.5 text-[11.5px] leading-snug text-slate">
              Le serveur le scanne — pas besoin de ton numéro.
            </p>
          </div>
        </div>
      </section>

      {/* ══ WHAT IS WAITING ═════════════════════════════════════════════
          At most one of these, and only when it is true. A permanent banner
          saying "you have 0 rewards" is furniture; this is either an errand or
          it is not on the screen. */}
      {pending > 0 ? (
        <Waiting
          href={`/${slug}/codes`}
          title={`${pending} récompense${pending > 1 ? "s" : ""} à récupérer`}
          hint="Montre le QR au comptoir — c'est déjà payé."
        />
      ) : readyCount > 0 ? (
        <Waiting
          href={`/${slug}/boutique`}
          title={`${readyCount} récompense${readyCount > 1 ? "s" : ""} à ta portée`}
          hint="Tu as assez de points — choisis la tienne."
        />
      ) : null}

      {/* ══ THE REST ════════════════════════════════════════════════════ */}
      {/*
        ONE ROW, NOT TWO TILES.

        It was "Mes codes · aucun" beside "Historique · mes points" — a tile
        whose value was the word for nothing, and a tile whose value was filler.
        Two thirds of that row said nothing on the most-opened screen in the
        product, directly under an errand card that already covers the codes
        when there are any.

        So: one row, to the one screen behind it, carrying a number that is
        true — how many movements are on this card.
      */}
      <section className="mt-3 px-4">
        <Tile
          href={`/${slug}/historique`}
          label="Mon activité"
          value={
            pending > 0
              ? `${pending} code${pending > 1 ? "s" : ""} · mes points`
              : "points, visites, récompenses"
          }
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          }
        />
      </section>

      {/*
        ══ WHAT THIS SHOP GIVES ═══════════════════════════════════════════
        The rewards themselves, on the card screen.

        Taking the ladder off this page (it moved to its own tab) left a hand's
        width of empty grey under the tiles — and worse, it left the card screen
        unable to answer "what am I saving FOR?" without a tap. A row of the
        actual things, with the shop's own photographs on them, is the reason
        somebody keeps the app installed.

        Horizontal, and deliberately cut off at the right edge: a row that ends
        exactly at the screen edge looks like the whole list, and nobody swipes
        a list they believe they have already seen.
      */}
      {ladder.length > 0 && (
        <section className="mt-5">
          <div className="flex items-baseline justify-between px-4">
            <h2 className="text-[14.5px] font-extrabold text-charcoal">À gagner ici</h2>
            <Link
              href={`/${slug}/boutique`}
              className="text-[12px] font-bold"
              style={{ color: "var(--cafe-text)" }}
            >
              Tout voir
            </Link>
          </div>

          {/*
            THE ROW KEEPS THE PAGE'S MARGIN ON BOTH SIDES.

            px-4 puts a margin at the start and, because a scroll container's
            padding collapses at the far end in every browser, NOTHING at the
            finish — so the last card ran flush into the screen edge while the
            first sat neatly inset. The scroll-padding keeps the snap honest and
            a spacer li restores the right-hand margin, which is the only thing
            that actually works across Safari and Chrome.
          */}
          {/*
            A SCROLLER ON A PHONE, A GRID ON A LAPTOP.

            Cutting the row off at the screen edge is what invites the swipe —
            and a swipe is not a gesture anybody performs with a mouse. With the
            room to show three at once, showing three at once is the answer.
          */}
          <ul className="mt-2.5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 [scroll-padding-left:1rem] [scrollbar-width:none] lg:grid lg:grid-cols-3 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
            {ladder.slice(0, 6).map((r) => {
              const affordable = r.pointsCost <= diner.balance;
              return (
                <li key={r.id} className="w-[148px] shrink-0 snap-start lg:w-auto">
                  <Link href={`/${slug}/boutique`} className="d-card block overflow-hidden active:scale-[0.98]">
                    <span
                      className="relative grid h-[86px] w-full place-items-center"
                      style={{ background: "var(--cafe-soft)", color: "var(--cafe-text)" }}
                    >
                      {/*
                        A photograph FILLS its tile — no padding, no letterbox.

                        The illustrated set had to be contained on a tint, because
                        cropping a drawing cuts the cup's handle off. A photograph
                        is the opposite: it wants the whole tile, edge to edge,
                        and the crop was already chosen on the busiest part of the
                        frame when the file was built (sharp's attention strategy).
                        The tint underneath is now only what shows when a shop has
                        no picture at all.

                        absolute inset-0, not h-full: this tile is a centred grid
                        item, and a percentage height on a centred item has no
                        definite box to resolve against — the image fell back to
                        its intrinsic size, overflowed the 86px tile, and
                        overflow-hidden cut the bottom off every one of them.
                      */}
                      {r.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
                        <img src={r.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <GiftIcon className="h-7 w-7" />
                      )}
                    </span>
                    <span className="block px-3 py-2.5">
                      {/* two lines, not an ellipsis: "Cappuccino off…" and
                          "Pâtisserie du jo…" name nothing, and naming the thing
                          is the entire job of this row */}
                      <span className="block text-[12.5px] font-bold leading-snug text-charcoal line-clamp-2 min-h-[2.4em]">
                        {r.label}
                      </span>
                      <span
                        className="mt-0.5 block text-[11.5px] font-extrabold"
                        style={{ color: affordable ? "var(--cafe-text)" : undefined }}
                      >
                        <span className={affordable ? "" : "text-slate"}>
                          {affordable ? "à prendre" : `${fmtPoints(r.pointsCost)} points`}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
            {/* the right-hand margin — see the note above */}
            <li aria-hidden className="w-3 shrink-0 lg:hidden" />
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * The one errand on the screen.
 *
 * Coloured, because it is the only thing here competing with the banner for
 * attention and it should win when it exists — but tinted rather than filled, so
 * it reads as a note from the shop and not as a second banner.
 */
function Waiting({ href, title, hint }: { href: string; title: string; hint: string }) {
  return (
    <Link
      href={href}
      className="mx-4 mt-3 flex items-center gap-3 rounded-[20px] px-4 py-3.5 transition active:scale-[0.99]"
      style={{ background: "var(--cafe-soft)", border: "1px solid var(--cafe-line)" }}
    >
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
        style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
      >
        <GiftIcon className="h-[19px] w-[19px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-extrabold" style={{ color: "var(--cafe-text)" }}>
          {title}
        </span>
        <span className="block truncate text-[11.5px] text-slate">{hint}</span>
      </span>
      <span className="shrink-0 text-[17px] leading-none text-slate/50">›</span>
    </Link>
  );
}

/** One shortcut, white and quiet — the colour on this screen belongs upstairs. */
function Tile({
  href,
  label,
  value,
  icon,
}: {
  href: string;
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="d-card flex items-center gap-3 px-3.5 py-3 transition active:scale-[0.98]"
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
        style={{ background: "var(--cafe-soft)", color: "var(--cafe-text)" }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-extrabold text-charcoal">{label}</span>
        <span className="block truncate text-[11px] font-medium text-slate">{value}</span>
      </span>
    </Link>
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
): { shown: number } {
  const expiresAt =
    program.stampExpiryDays > 0 && startedAt
      ? new Date(startedAt).getTime() + program.stampExpiryDays * 86_400_000
      : null;
  const lapsed = expiresAt !== null && stamps > 0 && expiresAt < Date.now();
  return { shown: lapsed ? 0 : Math.min(stamps, Math.max(0, program.stampsRequired - 1)) };
}
