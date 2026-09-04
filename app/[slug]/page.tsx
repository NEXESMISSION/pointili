import Link from "next/link";
import { CafeClosed } from "@/components/CafeClosed";
import { businessType } from "@/lib/businessTypes";
import { notFound, redirect } from "next/navigation";
import { GiftIcon, Sparkle, UserIcon } from "@/components/icons";
import { getCafe, getLoyaltyProgram, getMember, getRewards, nextRewardNudge } from "@/lib/data";
import { balanceSinceLastOpen, dinerWallet } from "@/lib/db";
import { currentDiner } from "@/lib/auth/diner";
import type { LoyaltyProgram } from "@/lib/types";
import { CardArrived } from "@/components/CardArrived";
import { CountUp } from "@/components/CountUp";
import { RewardUnlocked } from "@/components/RewardUnlocked";
import { MarkOpened } from "@/components/MarkOpened";
import { codeQr } from "@/lib/qr";
import { inkOn, safeColor } from "@/lib/theme";
import { t as translation, type T } from "@/lib/i18n";
import { Tpl } from "@/components/Tpl";
import { ShopLogo } from "@/components/ShopLogo";

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
  /*
    ── ONE WAIT, NOT TWO ─────────────────────────────────────────────────
    This screen used to resolve the member, and only THEN start the five reads
    beside it — a whole round trip in series, on the page a customer is holding
    up at a till. Every one of those reads needs either cafe.id (known already)
    or the phone, and the phone comes from the COOKIE, not from the member
    lookup: getMember's own answer is only needed to decide whether this person
    belongs here.

    So they all leave together. `diner` is still awaited first below, and a
    non-member still redirects before anything renders — the five results are
    simply already in hand by then instead of being asked for afterwards.
  */
  const phone = await currentDiner();
  if (!phone) redirect(`/${slug}/rejoindre`);

  const [diner, seen, program, rewards, wallet] = await Promise.all([
    getMember(cafe.id),
    balanceSinceLastOpen(cafe.id, phone),
    getLoyaltyProgram(cafe.id),
    getRewards(cafe.id),
    dinerWallet(phone),
  ]);
  if (!diner) redirect(`/${slug}/rejoindre`);

  /* READ BEFORE TOUCHING: `seen` above is taken before markCardOpened moves the
     "last seen" mark, or the diff is always empty and the customer is never
     told they have earned something. */
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

  /* French or Tunisian. `t(fr)` returns the French unchanged in French, so the
     sentences below stay readable as the thing the customer sees. */
  const t = await translation();

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
    /* the two corners, at the amount the shop chose (globals.css) */
    theme.bannerRound === "none" ? "" : `d-banner--round-${theme.bannerRound}`,
    /* a texture over the colour — never over a photograph, which has its own */
    !coverUrl && theme.pattern !== "none" ? `d-banner--${theme.pattern}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  /* How much colour there is before the card starts. The header and the balance
     sit inside this, so it is padding rather than a height — the banner still
     grows if a shop has a long name. */
  const bannerPad = { s: "pb-9", m: "pb-14", l: "pb-20" }[theme.bannerHeight];

  return (
    /* data-carte is a landmark for the suites, not styling — a test should break
       when the BEHAVIOUR breaks, never when the wording improves. */
    <div data-carte className="flex flex-1 flex-col pb-6">
      <MarkOpened slug={slug} />
      {/*
        BOTH ARE RENDERED ALWAYS AND DECIDE FOR THEMSELVES. `play` is the
        condition; mounting is not.

        Rendering them conditionally is what silently killed both of them.
        MarkOpened above calls a server action on mount, and a server action
        re-renders the route it was called from — so a frame after this page
        paints, it renders AGAIN with the card already marked as opened. Every
        condition here is false on that pass, and a conditionally-rendered
        celebration is unmounted mid-animation. The card arrival never played
        for a single person who joined; the unlock never played for anyone
        whose reward had just come into reach.

        Kept mounted, each one's useState initialiser holds the decision made
        on the first render, which is the render that had the truth.
      */}
      <CardArrived
        play={Boolean(nouveau || seen.firstOpen)}
        cafeName={cafe.name}
        points={program.welcomePoints ?? 0}
        lang={t.lang}
      />
      {/* A brand-new card gets CardArrived, never both — balanceSinceLastOpen
          returns an empty diff for a card that has never been opened. */}
      <RewardUnlocked
        play={Boolean(!nouveau && !seen.firstOpen && justUnlocked)}
        label={justUnlocked?.label ?? ""}
        imageUrl={justUnlocked?.imageUrl ?? null}
        href={`/${slug}/boutique`}
        lang={t.lang}
      />

      {/* ══ THE BANNER — the shop's, not ours ═══════════════════════════
          Flat, a gradient off their own colour, or their photograph. The photo
          is a background-image rather than an <img> because it is a SURFACE,
          not content: nothing should announce it to a screen reader, and it has
          to sit under the scrim that keeps the name and the balance legible. */}
      <section
        className={`d-banner ${bannerClass} ${bannerPad} safe-t relative overflow-hidden px-5 [--safe-pt:0.75rem]`}
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
            aria-label={t("Mon profil")}
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
            aria-label={`${t("Mes cartes")} — ${t.n(wallet.length, "boutique")}`}
            /*
              NEUTRAL, on purpose. This was --cafe-ink at 15% — a translucent
              wash, so over a green banner it read green and over a red one red.
              The tile is not the shop's: it is the way OUT of this card and into
              the other shops the customer carries. Wearing this shop's colour
              made the platform's own control look like one of its features.

              Opaque rather than another tint, because any translucent fill
              takes the hue underneath it. Grey on every banner, and the ink goes
              charcoal with it — white text on a light grey pill was the reason
              the fill had to borrow colour in the first place.
            */
            className="flex min-w-0 flex-1 items-center justify-center gap-2.5 rounded-full bg-[var(--o-inset)] py-2 pl-3 pr-3.5 text-charcoal transition active:scale-[0.97]"
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
                {t("Mes cartes")}
              </span>
              {/* t.n, not a manual "s" — Arabic counts in bands, so 2 فروع and
                  30 فرع are both right and no boolean produces both. */}
              <span className="block text-[11px] font-semibold leading-tight opacity-75">
                {t.n(wallet.length, "boutique")}
              </span>
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 opacity-80 rtl:-scale-x-100" aria-hidden>
              <path d="m9 6 6 6-6 6" />
            </svg>
          </Link>

          <Link
            href={`/${slug}/historique`}
            aria-label={
              pending > 0
                ? t("{n} à récupérer", { n: t.n(pending, "récompense") })
                : t("Mes codes")
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
          <ShopLogo
            url={cafe.logoUrl}
            shape={theme.logoShape}
            emoji={type.emoji}
            size={46}
            ring="color-mix(in oklab, var(--cafe-ink) 28%, transparent)"
            tint="color-mix(in oklab, var(--cafe-ink) 16%, transparent)"
          />
          <span className="min-w-0">
            <span className="block truncate text-[18px] font-extrabold leading-tight tracking-[-0.015em]">
              {cafe.name}
            </span>
            {/* "Café" reads مقهى here — the category is chrome, not the shop's
                own name, so it belongs to the reader's language. */}
            <span className="block text-[12px] font-semibold opacity-70">{t(type.label)}</span>
          </span>
        </div>

        {/* what I have — the one number this screen exists to show */}
        <div className="mt-6 flex items-end gap-2">
          <CountUp
            from={seen.before}
            to={diner.balance}
            className="text-[52px] font-extrabold leading-[0.9] tabular-nums tracking-[-0.04em]"
          />
          {/* t.unit, not t("points"): the figure is animated by CountUp above,
              so the noun is a separate element — and it still has to agree
              with the balance (118 نقطة, but 5 نقاط). */}
          <span className="pb-1.5 text-[15px] font-bold opacity-75">
            {t.unit(diner.balance, "point")}
          </span>
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
            {/* One sentence in the dictionary, not four fragments — so the
                Tunisian can read «باقيلك 30 نقطة باش تاخذ أتاي بالنعناع»
                instead of French word order wearing Arabic words. */}
            <p className="mt-2.5 text-[12.5px] leading-snug opacity-85">
              <Tpl
                tpl={t("Encore {n} pour {reward}")}
                slots={{
                  n: <b className="font-extrabold">{t.n(nudge.needed, "point")}</b>,
                  reward: <b className="font-extrabold">{t(nudge.target.label)}</b>,
                }}
              />
            </p>
          </div>
        ) : readyCount > 0 ? (
          /* Nothing left to save for — say THAT rather than falling through to
             the earning rate, which reads as a shrug when you can already
             afford the best thing on the menu. */
          <p className="mt-5 text-[12.5px] leading-snug opacity-85">
            {t("Tu peux prendre n'importe quelle récompense ici.")}
          </p>
        ) : (
          <p className="mt-5 text-[12.5px] leading-snug opacity-85">
            {rateLabel(program.pointsPerTnd, t)}
          </p>
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
          /*
            ── THE STAMP CARD IS A CARD ────────────────────────────────────────

            These were 22px rings drawn straight onto the shop's colour, with a
            1px dashed border at 45% opacity. On a mid-tone field that is a row
            of faint scratches: you could not count them at arm's length, which
            is the only thing a stamp card is for. Two separate mistakes were
            doing it — the size, and drawing a light-on-light outline on a
            saturated ground.

            So it gets its own plate. On white the empty ring can be a real
            line instead of a hint, the filled one can be the shop's own colour
            at full strength, and 30px is a countable circle rather than a dot.
            It also stops the card saying two different things in one breath:
            the tinted half is the points, this is the visits.
          */
          <div className="mt-4 rounded-[20px] bg-white px-4 py-3.5">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: program.stampsRequired }).map((_, i) => {
                const filled = i < stampView.shown;
                const isReward = i === program.stampsRequired - 1;
                return (
                  <span
                    key={i}
                    className="grid h-[30px] w-[30px] place-items-center rounded-full"
                    style={
                      filled
                        ? { background: "var(--cafe-text)", color: "#ffffff" }
                        : {
                            /* A real 2px line, and dashed only on the ones still
                               to come — the last ring holds the reward, so it is
                               solid and tinted: the thing you are walking to
                               should not look like another empty slot. */
                            border: isReward
                              ? "2px solid var(--cafe-text)"
                              : "2px dashed var(--cafe-line)",
                            color: "var(--cafe-text)",
                            background: isReward ? "var(--cafe-soft)" : undefined,
                          }
                    }
                  >
                    {filled ? (
                      <Sparkle className="h-[14px] w-[14px]" />
                    ) : isReward ? (
                      <GiftIcon className="h-[14px] w-[14px]" />
                    ) : null}
                  </span>
                );
              })}
            </div>
            <p className="mt-2.5 text-[12.5px] leading-snug text-charcoal">
              {stampsLeft <= 0 ? (
                <b className="font-extrabold">
                  {t("{reward} t'attend 🎉", { reward: t(program.stampReward) })}
                </b>
              ) : (
                /* «باقيلك 8 زيارات باش تاخذ قهوة هدية.» — the visits count in
                   bands like everything else, so t.n owns the word. */
                <Tpl
                  tpl={t("Encore {n} pour {reward}.")}
                  slots={{
                    n: t.n(stampsLeft, "visite"),
                    reward: <b className="font-extrabold">{t(program.stampReward)}</b>,
                  }}
                />
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
              {t("Mon code client")}
            </p>
            <p
              className="mt-1 font-mono text-[30px] font-extrabold leading-none tracking-[0.14em]"
              style={{ color: "var(--cafe-text)" }}
            >
              {diner.code}
            </p>
            <p className="mt-1.5 text-[11.5px] leading-snug text-slate">
              {t("Le serveur le scanne — pas besoin de ton numéro.")}
            </p>
          </div>
        </div>
      </section>

      {/* ══ WHAT IS WAITING ═════════════════════════════════════════════
          At most one of these, and only when it is true. A permanent banner
          saying "you have 0 rewards" is furniture; this is either an errand or
          it is not on the screen. */}
      {pending > 0 ? (
        /*
          THE NAME OF THE THING, when there is only one of them.

          "1 récompense à récupérer" is a category and a number; "Espresso
          offert" is the actual object the person is owed, and it is already in
          hand — diner.codes carries the label. A customer glancing at this
          screen in a queue should not have to open anything to remember what
          they are about to be handed.
        */
        <Waiting
          href={`/${slug}/codes`}
          title={pending === 1 ? t(diner.codes[0].label) : t("{n} à récupérer", { n: t.n(pending, "récompense") })}
          hint={t("Montre le QR au comptoir — c'est déjà payé.")}
        />
      ) : readyCount > 0 ? (
        <Waiting
          href={`/${slug}/boutique`}
          title={t("{n} à ta portée", { n: t.n(readyCount, "récompense") })}
          hint={t("Tu as assez de points — choisis la tienne.")}
        />
      ) : null}

      {/* ══ THE REST ════════════════════════════════════════════════════ */}
      {/*
        A LINK, NOT A SECOND CARD.

        This was a full-width tile directly under the errand card above it, and
        the two were the same shape: icon in a circle, bold line, grey line,
        chevron. Two rows of identical weight, one of which is "something is
        waiting for you RIGHT NOW" and one of which is "read your past" — the
        screen gave them equal say, so neither carried any urgency.

        Worse, it repeated the errand. Its value line read "1 code · mes
        points": the same waiting reward, counted a second time, three
        centimetres under the card that already named it, joined to a fragment
        that is not a sentence. In Tunisian that came out "1 كود · النقاط
        متاعي", which is the version that finally made somebody say it out loud.

        So the errand keeps the card, and history becomes what it actually is —
        one quiet line you tap when a balance surprises you. Its label says what
        is behind it and never counts anything the screen has already counted.
      */}
      <div className="mt-3 px-4">
        <Link
          href={`/${slug}/historique`}
          className="flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-bold text-slate transition active:scale-[0.99]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {t("Mon activité")}
          <span className="text-[15px] leading-none opacity-50 rtl:rotate-180">›</span>
        </Link>
      </div>

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
            <h2 className="text-[14.5px] font-extrabold text-charcoal">{t("À gagner ici")}</h2>
            <Link
              href={`/${slug}/boutique`}
              /* 13px and a -my-2 py-2 hit box: this was 12px in a 19px-tall
                 target, on the busiest screen in the product. The negative
                 margin buys the height back without moving the baseline. */
              className="-my-2 py-2 text-[13px] font-bold"
              style={{ color: "var(--cafe-text)" }}
            >
              {t("Tout voir")}
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
                      {/* t() on a reward NAME looks odd but is deliberate: most
                          shops keep the suggestions the app offered them, so
                          "Café offert" becomes قهوة هدية, and a name a shop
                          typed itself falls through to its own words. */}
                      <span className="block text-[12.5px] font-bold leading-snug text-charcoal line-clamp-2 min-h-[2.4em]">
                        {t(r.label)}
                      </span>
                      <span
                        className="mt-0.5 block text-[11.5px] font-extrabold"
                        style={{ color: affordable ? "var(--cafe-text)" : undefined }}
                      >
                        <span className={affordable ? "" : "text-slate"}>
                          {affordable ? t("à prendre") : t.n(r.pointsCost, "point")}
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


/**
 * "1 dinar = 1 point", or "1 dinar = 2 points", or "2 dinars = 1 point".
 *
 * Always phrased from the dinar, because that is the number the customer is
 * about to hand over. A rate below 1 is inverted rather than shown as "0,5
 * point par dinar", which nobody converts in their head at a counter.
 */
function rateLabel(rate: number, t: T): string {
  if (!rate || rate <= 0) return t("Cumule des points à chaque achat");
  if (rate >= 1) {
    const n = Math.round(rate * 100) / 100;
    return t("1 dinar dépensé = {n}", { n: t.n(n, "point") });
  }
  const dinars = Math.round((1 / rate) * 10) / 10;
  return t("{d} dinars dépensés = 1 point", { d: dinars });
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
