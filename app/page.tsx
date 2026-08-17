import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLockup } from "@/components/BrandMark";
import { currentDiner } from "@/lib/auth/diner";
import { Showcase } from "@/components/Showcase";
import { hasOwnerCookie } from "@/lib/auth/owner";
import { DESCRIPTION, JsonLd, organisation, product, SITE_URL } from "@/lib/seo";
import { currentLang, dir, translator, type T } from "@/lib/i18n";
import { LangToggle } from "@/components/LangToggle";
import { Tpl } from "@/components/Tpl";
import { platformSettings } from "@/lib/settings";
import type { Offer } from "@/lib/billing";

/**
 * The landing page, set like printed matter.
 *
 * WHAT THIS PAGE USED TO BE, and why it stopped working: Poppins ExtraBold
 * with a violet gradient clipped into the second line of the headline, two
 * blurred radial blobs behind it, a phone breathing inside a rotating ring
 * with particles drifting past, and below that a run of rounded-3xl cards
 * floating on white under violet glow. Every one of those is a signature of a
 * generated page, and having all of them at once made a real product — nine
 * clips of software that genuinely works — look like a template with the
 * copy filled in.
 *
 * components/icons.tsx has stated the actual house style since the beginning:
 * "speaks in type, not iconography — features are numbered (№ 01) rather than
 * badged." This page is that, finally: FRAUNCES for display (loaded in
 * layout.tsx since the first commit and until now used by nothing), Inter for
 * reading, Space Mono for anything countable. Flat ink, hard-edged colour
 * fields, hairline rules. No gradient text, no blur, no ambient motion.
 *
 * ── FOUR SECTIONS, AND THAT IS THE DESIGN ────────────────────────────────
 *
 *   hero → the three gestures at the counter → two clips of the real thing →
 *   the price, with the way in inside it
 *
 * It was nineteen phone screens and 1,219 words across eighteen sections: a
 * trades list, an analytics section, three theme screenshots, a comparison
 * table against carton, eight FAQ entries, nine clips, two price cards and a
 * closing panel that repeated the hero. Every piece was defensible on its own
 * and the sum was a document. A café owner deciding whether to try this reads
 * it standing behind a counter, on a phone.
 *
 * Six screens now, 349 words. The rule applied was: keep what a person needs
 * to decide, and cut what only answers an objection they have not raised yet.
 * What went is not lost — the comparison, the FAQ and the analytics copy are
 * in git, and the seven unused clips are still filmed and captioned in
 * components/Showcase, one word away from coming back.
 *
 * THE AUDIENCE SWITCH WENT WITH THEM. Half this page existed twice, once for a
 * customer who almost never arrives here: they reach their card by scanning
 * the sticker on their table. The one who lost it gets a link to their wallet —
 * in the masthead, or in the footer on a phone, where the row has only enough
 * width for the owner's way in. That link is the errand they actually have.
 *
 * This root is also the BUSINESS front door. A diner who lands here already
 * has a card, so they are sent to their wallet. See /moi for the customer's
 * own door.
 */

export const metadata = {
  title: "Une carte de fidélité, tous vos commerces",
  description: DESCRIPTION,
  alternates: { canonical: "/" },
};

/* ── the only two marks left on the page ──────────────────────────────────
   The stroke-icon set that used to live here (cup, burger, scissors, bag,
   lipstick, phone, star, bar chart) is gone with the sections that held it:
   five of them dressed a category list up as a customer logo strip, and three
   sat in gradient tiles above copy that said nothing. What is left is an
   arrow that means "go" and a tick that means "included". */
const S = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p} />
);
const Arrow = ({ className = "h-4 w-4" }: { className?: string }) => (
  <S className={className} strokeWidth="2.4"><path d="M5 12h13M12 6l6 6-6 6" /></S>
);
const Check = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <S className={className} strokeWidth="3"><path d="m5 12.5 4.5 4.5L19 7" /></S>
);

/* ── the three reasons, iconed ──────────────────────────────────────────────
   Every one of these is checkable. "Sans application" is the claim the whole
   product rests on and the one a competitor cannot copy without rebuilding;
   "zéro frais caché" is the pricing section's own words; five seconds is what
   the till clip shows happening. The design's "100% sécurisé · données
   chiffrées" is not here because it is the sentence every page prints and none
   can be held to. */
const Bolt = ({ className = "h-5 w-5" }: { className?: string }) => (
  <S className={className} strokeWidth="2"><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" /></S>
);
const Shield = ({ className = "h-5 w-5" }: { className?: string }) => (
  <S className={className} strokeWidth="2"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3Z" /></S>
);
const Tick = ({ className = "h-5 w-5" }: { className?: string }) => (
  <S className={className} strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="m8.5 12.2 2.4 2.4 4.6-4.9" /></S>
);

const BENEFITS = [
  { icon: Bolt, title: "Ultra rapide", line: "Encaissez en 5 secondes" },
  { icon: Shield, title: "Sans application", line: "Ni pour vous, ni pour vos clients" },
  { icon: Tick, title: "Zéro frais caché", line: "Pas de commission sur vos ventes" },
];

/* ── the four columns under the price ──────────────────────────────────────
   The four questions an owner has once they have seen the number: what do I
   get, what does it really cost, what do I learn, and who answers when it
   breaks. They replace a seven-item tick list, which was a specification
   rather than an argument. */

/* What the year buys. Seven things, all of which exist. */
const INCLUDED = [
  "Programme fidélité",
  "QR Code illimité",
  "Récompenses",
  "Carte à vos couleurs",
  "Français et tunisien",
  "Analyses et statistiques",
  "Support en Tunisie",
];

/*
  THE PRICES ON THIS PAGE ARE THE PRICES THE RENEWAL SCREEN CHARGES.

  They were module constants read from lib/billing, which made them a deploy
  away from the operator; they come from the platform settings now (0041) and
  are resolved per request, inside the component, because a module-level read
  would be evaluated once at build and never again.

  Picked by DURATION rather than by id, and with a fallback, because the offer
  list is editable: a landing page that throws because somebody renamed "12m"
  is the worst possible outcome of a price change. Advertising 80 while the
  renewal screen invoices 120 is the second worst, which is why neither number
  is typed on this page.

  The saving under the year card is arithmetic on these two, not a third figure
  to keep in step: two half-years against one year.
*/
function priceBlocks(offers: Offer[]) {
  const longest = [...offers].sort((a, b) => b.months - a.months)[0];
  const shorter = [...offers].sort((a, b) => a.months - b.months)[0];
  return {
    YEAR: offers.find((o) => o.months === 12) ?? longest,
    HALF: offers.find((o) => o.months === 6) ?? (shorter !== longest ? shorter : null),
  };
}
export default async function Landing({
  searchParams,
}: {
  searchParams: Promise<{ pro?: string }>;
}) {
  /*
    "/" IS A SWITCHBOARD, not just a sales page.

    It is also the manifest's start_url, which makes this the code that decides
    what the installed app opens on. Getting it wrong is very visible: tapping
    the icon on a home screen and landing on a page that tries to sell you the
    product you already bought.

    The order below is the whole of it:

      ?pro=1        always the sales page. The manual escape hatch, and the only
                    way an owner reaches their own marketing copy.
      owner session their till. They pay for it; it is what the icon means to
                    them. /owner re-checks the session properly and sends a
                    signed-out visitor to /owner/login, so a stale cookie here
                    costs one redirect and grants nothing.
      diner cookie  their wallet.
      otherwise     the sales page.

    Both checks are by cookie PRESENCE, not verification: this is routing, not
    authorisation, and currentOwner() would cost a getUser() round trip on every
    anonymous hit of the busiest public page. Neither destination trusts it.
  */
  const { pro } = await searchParams;
  const ownerHere = await hasOwnerCookie();
  if (!pro) {
    if (ownerHere) redirect("/owner");
    if (await currentDiner()) redirect("/cartes");
  }

  /*
    ?pro=1 is how a SIGNED-IN owner reaches this page — it is the escape hatch
    the app links to from the sidebar, Réglages and the login screen. So this
    page has to stop selling to somebody who already bought: no free trial they
    are already past, no sign-in form they are already through.

    Cookie presence, not verification, same as the redirect above: this decides
    WORDING, and both destinations re-check properly.
  */
  /*
    The reader's language, from the same cookie the customer app uses.

    This page costs nothing extra to make dynamic — it already awaits
    searchParams for ?pro=1, so it was never static — and the language stays a
    preference of the PERSON rather than a segment in the URL, which is what
    lib/dict argues for and what keeps pointili.online/{slug} meaning one thing
    for everybody who scans a sticker.
  */
  const lang = await currentLang();
  const t = translator(lang);

  /* Per request, not per build: the operator can change a price from
     /admin/reglages and this page has to say the new one. */
  const { YEAR, HALF } = priceBlocks((await platformSettings()).offers);
  const SAVING = HALF ? HALF.price * 2 - YEAR.price : 0;

  const cta = ownerHere
    ? { href: "/owner", label: t("Aller à ma caisse"), note: t("Vous êtes déjà connecté") }
    : {
        href: "/owner/signup",
        label: t("Commencer gratuitement"),
        note: t("14 jours gratuits · Sans carte bancaire"),
      };

  return (
    /*
      dir and lang-tn both live on THIS element, not on <html>.

      It is the pattern app/[slug]/layout.tsx already uses — each section of
      the product owns its own direction — and it is also what makes the
      typography fix in globals.css work: `.landing-light.lang-tn` needs both
      classes on one element to out-specify `.landing-light h1`, which would
      otherwise set every Arabic heading in a face that has no Arabic in it.
    */
    <div
      dir={dir(lang)}
      lang={lang === "tn" ? "ar-TN" : "fr"}
      className={`landing-light min-h-dvh bg-white text-charcoal${lang === "tn" ? " lang-tn" : ""}`}
    >
      {/*
        Server-rendered schema.org, so a crawler that runs no JavaScript still
        sees it — which is most AI crawlers. Deliberately no aggregateRating: we
        have no reviews, and inventing one is both a lie and the fastest way to
        have the whole block ignored.
      */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            organisation(),
            product(),
            {
              "@type": "WebSite",
              "@id": `${SITE_URL}/#website`,
              url: SITE_URL,
              name: "Pointili",
              inLanguage: lang === "tn" ? "ar-TN" : "fr",
              publisher: { "@id": `${SITE_URL}/#organization` },
            },
          ],
        }}
      />

      {/* ── masthead ───────────────────────────────────────────────── */}
      <header className="border-b border-hair">
        {/*
          ONE GAP, NOT TWO.

          Three children under justify-between spread themselves evenly, so on
          a 1900px screen the language toggle sat alone in the middle with 325px
          of nothing on either side of it — three islands rather than a
          masthead, which is what reads as "off balance" long before anybody can
          say which element is wrong.

          The mark on one side, everything you can press on the other. The row
          then has a single piece of empty space in it, and that space grows
          with the window instead of being divided into two stranded halves.
        */}
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4 md:px-8">
          <Brand tight />
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <LangToggle current={lang} />
            {/*
              THE CUSTOMER SIDE IS ONE LINK NOW, not half a website.

              This page used to carry a Commerce/Client switch that rewrote it:
              a second headline, a second set of three steps, and a filter over
              the clips — a parallel page maintained for a visitor who almost
              never arrives here. Customers reach their card by scanning the
              sticker on the table. The one who lost it wants their wallet, and
              that is what this is.
            */}
            {/*
              TWO WAYS IN, AND EACH ONE NAMES WHERE IT GOES.

              This page is read by both audiences, and the two controls up here
              used to be "Je suis client" and "Espace café" — one naming a
              PERSON, the other a PLACE, so neither told you what pressing it
              would do. Worse, the customer link was hidden below sm: the one
              visitor who arrives here rather than by scanning a sticker is the
              one who LOST the sticker, and on a phone they were shown nothing.

              Both are visible at every width now, and both say their
              destination: "Mes cartes" is the wallet, "Espace café" is the
              till. The customer's is quiet because most customers never come
              here at all; it is present because the ones who do have exactly
              one errand.
            */}
            <Link
              href="/moi"
              className="whitespace-nowrap text-[13.5px] font-semibold text-slate transition hover:text-charcoal"
            >
              {t("Mes cartes")}
            </Link>
            <Link
              href={ownerHere ? "/owner" : "/owner/login"}
              className="whitespace-nowrap rounded-[3px] border border-charcoal px-3.5 py-2 text-[13.5px] font-bold text-charcoal transition hover:bg-charcoal hover:text-white"
            >
              {ownerHere ? t("Ma caisse") : t("Espace café")}
            </Link>
          </div>
        </div>
      </header>

      {/* ── hero ─────────────────────────────────────────────────────
          Built to a supplied design, in this order, on every width:

            origin badge → headline → ONE sentence → three benefits →
            one button and one quiet "see how it works" → the product

          The phone comes last in the DOM, which is also the order it should
          be read on a phone: words, reasons, action, then the picture. On a
          laptop the grid puts it beside them without changing that order.

          THE SENTENCE IS ONE SENTENCE. There was a paragraph here once, then
          nothing at all; a single line is what a person actually reads between
          a headline and a button.

          THE THREE BENEFITS ARE CLAIMS THIS PRODUCT CAN KEEP. The design's
          middle one is "100% sécurisé · données chiffrées et protégées", which
          is the kind of sentence every SaaS page prints and none of them can
          be held to. What this product genuinely has, and its competitors
          mostly do not, is that nobody installs anything. */}
      <section className="relative overflow-hidden border-b border-hair">
        <div className="mx-auto grid max-w-6xl items-center px-5 md:grid-cols-12 md:px-8">
          <div className="relative z-10 pb-12 pt-12 md:col-span-6 md:pb-20 md:pe-10 md:pt-20">
            {/* the origin line, with the real flag — see /public/tunisia.webp */}
            <p className="inline-flex items-center gap-2.5 rounded-full border border-hair bg-white px-3.5 py-1.5 text-[13px] font-semibold text-charcoal">
              <Image
                src="/tunisia.webp"
                alt=""
                width={40}
                height={40}
                className="h-[17px] w-[17px] rounded-full object-cover"
              />
              {t("Fait en Tunisie, pour la Tunisie")}
            </p>

            <h1 className="hero-title mt-6 text-[40px] leading-[1.06] md:text-[52px] lg:text-[58px]">
              {t("Vos habitués reviennent.")}
              <br />
              <span className="text-royal">{t("Simplement.")}</span>
            </h1>

            <p className="mt-5 max-w-[42ch] text-[16px] leading-[1.6] text-slate">
              {t("La carte de fidélité de votre commerce, dans le téléphone de vos clients.")}
            </p>

            <ul className="mt-9 grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-5">
              {BENEFITS.map(({ title, line, icon: Icon }) => (
                <li key={title}>
                  <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-lilac-2 text-royal">
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="mt-3 text-[14.5px] font-bold text-charcoal">{t(title)}</p>
                  <p className="mt-1 text-[13px] leading-snug text-slate">{t(line)}</p>
                </li>
              ))}
            </ul>

            <div className="mt-9 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:gap-6">
              <Link
                href={cta.href}
                className="group inline-flex items-center justify-center gap-3 rounded-[12px] bg-royal px-7 py-4 text-[15px] font-bold text-white transition hover:bg-[#4c33b4] active:translate-y-px"
              >
                {cta.label}
                <Arrow className="cta-arrow h-4 w-4" />
              </Link>

              {/* Quiet, and it is a LOOK rather than a second sale: it jumps to
                  the product running, which is the only thing on this page that
                  answers "yes, but what is it" without asking for anything. */}
              <a
                href="#produit"
                className="group inline-flex items-center justify-center gap-2.5 text-[14.5px] font-semibold text-charcoal transition hover:text-royal"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full border border-hair text-royal transition group-hover:border-royal/40">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="ms-[2px] h-3 w-3">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
                {t("Voir comment ça marche")}
              </a>
            </div>

            <p className="mt-6 text-[13px] text-slate">{cta.note}</p>

            {/*
              THE OTHER READER, ANSWERED IN ONE LINE.

              /moi already carries the mirror of this — "Vous êtes commerçant ?
              → Espace café" — because that page is the customer's door and an
              owner can land on it by mistake. This is the same sentence from
              the other side, and it was missing: everything above it addresses
              somebody who owns a shop, and a customer who followed a link here
              had to work out that none of it was for them.

              It sits under the button rather than above the headline: the
              customer is the rarer visitor, and the rarer visitor gets the
              quieter line, not the first one.
            */}
            <p className="mt-5 border-t border-hair pt-5 text-[13.5px] text-slate">
              {t("Vous êtes client ?")}{" "}
              <Link
                href="/moi"
                className="font-bold text-royal underline underline-offset-2 transition hover:text-[#4c33b4]"
              >
                {t("Retrouvez vos cartes")}
              </Link>
            </p>
          </div>

          {/*
            ONE DOMINANT PRODUCT IMAGE, and it does the explaining.

            The field bleeds off the page, so it is written with LOGICAL sides:
            left/right do not flip, and in Tunisian this bled straight across
            the type column — and being later in the DOM it painted over it. The
            whole hero rendered as an empty dotted rectangle with a phone in it.
            The type column is lifted above this rather than this being pushed
            below, which was the first fix and sent the field behind an
            ancestor's white background instead.
          */}
          <div className="relative md:col-span-6">
            {/*
              THE FIELD FADES ON ALL FOUR SIDES — colour and dots together.

              Two things had to change. The tint and the dot grid were separate
              elements and only the dots were masked, so the pattern dissolved
              onto a hard-edged pale rectangle: the fade fixed the texture and
              left the panel it sat on with four straight sides, which is the
              edge you actually notice.

              And the mask was a centred ellipse. This panel BLEEDS — it is
              1184px wide with about 640 of it on screen — so "50%" is near the
              right edge of the viewport and the falloff happened off-screen,
              leaving roughly half opacity exactly where the panel meets the
              type column. A percentage of a box you cannot see is not a fade.

              So: two symmetric linear fades, one per axis, on nested elements.
              Symmetric means it is direction-agnostic — Tunisian mirrors the
              whole grid and this needs no RTL variant. Nested rather than
              mask-composite, which Safari only learned recently and which
              degrades to "last layer wins" where it is missing.
            */}
            <div
              aria-hidden
              className="absolute inset-y-0 -start-5 -end-5 md:start-0 md:-end-[50vw]"
              style={{
                maskImage: "linear-gradient(to bottom, transparent, #000 15%, #000 85%, transparent)",
                WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 15%, #000 85%, transparent)",
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  /* dots FIRST, tint last: background-image paints front to
                     back, so reversing them hides the pattern under its own
                     background. */
                  backgroundImage:
                    "radial-gradient(circle, rgba(91,63,209,.18) 1.6px, transparent 1.6px)," +
                    "linear-gradient(#f7f5fe, #f7f5fe)",
                  backgroundSize: "22px 22px, 100% 100%",
                  maskImage: "linear-gradient(to right, transparent, #000 16%, #000 84%, transparent)",
                  WebkitMaskImage: "linear-gradient(to right, transparent, #000 16%, #000 84%, transparent)",
                }}
              />
            </div>
            <div className="relative flex justify-center pb-12 pt-4 md:h-full md:items-end md:pb-0 md:pt-16">
              <HeroPhone t={t} />
            </div>
          </div>
        </div>
      </section>

      {/* ── the product, filmed ────────────────────────────────────── */}
      <section id="produit" className="mx-auto max-w-6xl scroll-mt-4 px-5 py-14 md:px-8 md:py-20">
        {/* No "LE PRODUIT, FILMÉ" eyebrow above this. It was a mono uppercase
            label saying, in three words, what the heading underneath it says in
            four — a row of chrome and 40px of height to introduce a heading
            that introduces itself. */}
        <h2 className="max-w-[18ch] text-[32px] md:text-[42px]">
          {t("Rien n'est dessiné ici.")}
        </h2>
        <p className="mt-4 max-w-[54ch] text-[15.5px] leading-relaxed text-slate">
          {t(
            "Chaque écran ci-dessous est le vrai produit, filmé en train de faire ce qu'il dit.",
          )}
        </p>

        {/*
          TWO, NOT NINE.

          Nine clips is nine screens arguing the same case over and over. These
          two are the whole pitch: you take the money, and you learn the one
          thing a carton could never tell you — which is what the headline
          promises. A third (carte.webm, the customer's own card) was here and
          came out because the hero is already a photograph of that exact
          screen; showing it twice is not evidence, it is repetition.

          The other seven are still filmed and still captioned in
          components/Showcase. Putting one back is a word in this list.
        */}
        <div className="mt-10 md:mt-12">
          <Showcase lang={lang} only={["credit", "analyses"]} />
        </div>
      </section>

      {/* ── the price ────────────────────────────────────────────────
          TWO BOXES, and the year is the one that is dressed.

          Both durations were real all along and only one of them was shown as
          a price — the half-year was a grey line under the year, which is a
          footnote, not an option. Side by side an owner can see what the choice
          actually costs: 80 twice is 160 against 120, and the saving is printed
          on the year rather than left as arithmetic on the table.

          The year is filled and carries the badge; the half-year is outlined
          and quiet. Two boxes of equal weight is a question, and this page
          should be answering one. */}
      <section className="border-t border-hair bg-mist">
        <div className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-20">
          <div className="mx-auto max-w-[560px] text-center">
            <h2 className="text-[32px] md:text-[42px]">{t("Un prix simple.")}</h2>
            <p className="mt-4 text-[15.5px] leading-relaxed text-slate">
              {t("Pas de commission sur vos ventes. Pas de limite de clients.")}
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-[820px] items-start gap-5 md:grid-cols-2">
            {/* ── the year ── */}
            <div className="relative rounded-[20px] border-2 border-royal bg-white p-7 shadow-[0_24px_60px_-40px_rgba(36,18,59,.45)]">
              {/* A saving is a COMPARISON. With one offer configured, or a
                  shorter one that is not actually dearer per month, the badge
                  would read "Économisez 0 TND" — a discount that insults the
                  reader's arithmetic. */}
              {SAVING > 0 && (
                <span className="absolute -top-3 start-7 rounded-full bg-royal px-3 py-1 text-[11.5px] font-bold text-white">
                  <Tpl tpl={t("Économisez {n} TND")} slots={{ n: SAVING }} />
                </span>
              )}

              <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-royal">
                {t("1 an")}
              </p>
              <p className="display mt-3 text-[60px] leading-[0.85] tabular-nums text-charcoal">
                {YEAR.price}
                <span className="ms-2 align-super font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-royal">
                  {t("TND")}
                </span>
              </p>
              <p className="mt-2 text-[13px] text-slate">{t(YEAR.perMonth)}</p>

              <Link
                href={cta.href}
                className="group mt-6 flex flex-col items-center rounded-[12px] bg-royal px-5 py-3.5 text-center transition hover:bg-[#4c33b4] active:translate-y-px"
              >
                <span className="flex items-center gap-2.5 text-[15px] font-bold text-white">
                  {cta.label} <Arrow className="cta-arrow h-4 w-4" />
                </span>
                <span className="mt-1 text-[12px] text-white/70">{cta.note}</span>
              </Link>
            </div>

            {/* ── six months ── */}
            {HALF && (
            <div className="rounded-[20px] border border-hair bg-white p-7">
              <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-slate">
                {t("6 mois")}
              </p>
              <p className="display mt-3 text-[60px] leading-[0.85] tabular-nums text-charcoal">
                {HALF.price}
                <span className="ms-2 align-super font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-slate">
                  {t("TND")}
                </span>
              </p>
              <p className="mt-2 text-[13px] text-slate">{t(HALF.perMonth)}</p>

              <Link
                href={cta.href}
                className="mt-6 flex items-center justify-center rounded-[12px] border border-charcoal px-5 py-3.5 text-center text-[15px] font-bold text-charcoal transition hover:bg-charcoal hover:text-white active:translate-y-px"
              >
                {t("Choisir 6 mois")}
              </Link>
              <p className="mt-3 text-center text-[12px] text-slate">{t("Sans engagement")}</p>
            </div>
            )}
          </div>

          {/* what both of them buy — said once, under both */}
          <ul className="mx-auto mt-8 grid max-w-[820px] gap-x-6 gap-y-3 border-t border-hair pt-7 sm:grid-cols-2 lg:grid-cols-3">
            {INCLUDED.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[14.5px] text-charcoal">
                <Check className="mt-[5px] h-3.5 w-3.5 shrink-0 text-royal" />
                {t(f)}
              </li>
            ))}
          </ul>

          {/*
            HOW YOU ACTUALLY PAY — the question a price alone never answers. A
            café owner in Tunisia does not have a card they will type into a
            website, and a page that shows only a number is quietly asking for
            one.
          */}
          <p className="mx-auto mt-7 max-w-[560px] text-center text-[12.5px] leading-relaxed text-slate">
            {t("D17, Flouci ou virement — vous envoyez la photo du reçu depuis l'application.")}
          </p>
        </div>
      </section>

      {/* ── footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-hair">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <Brand />
            <p className="mt-3 text-[13px] text-slate">
              {t("Conçu et hébergé pour la Tunisie")}
            </p>
          </div>
          {/* py-2 on the links, not just on the row: they were 22px tall, and a
              22px target is a miss on a phone. */}
          <nav className="flex flex-wrap items-center gap-x-8 text-[13.5px] text-slate">
            <Link href="/confidentialite" className="py-2 transition hover:text-charcoal">
              {t("Confidentialité")}
            </Link>
            <Link href="/conditions" className="py-2 transition hover:text-charcoal">
              {t("Conditions")}
            </Link>
            <span className="py-2">{t("Contact")}</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/**
 * The hero art: a phone, standing still.
 *
 * It used to sit inside three animated layers — a breathing radial halo, a
 * conic ring rotating once every 46 seconds, and six violet dots drifting
 * upward past it — plus a 7-second float on the device itself. All of it was
 * carefully built, none of it said anything, and together they were the
 * loudest thing on the page. Ambient motion in the corner of the eye is read
 * as decoration; the only motion left on this page is the nine demo clips,
 * which are the software running.
 *
 * IT IS A SCREENSHOT NOW, NOT A RENDER — and that is a correctness fix, not a
 * change of taste.
 *
 * hero-phone-v2.png was a 3/4-angled glossy render of a DARK purple card. The
 * customer app has been white since the light conversion, so the largest image
 * on the site showed a product that no longer exists — directly above nine
 * clips of the real one, under a heading that says «Rien n'est dessiné ici».
 * The page contradicted its own claim in its own hero.
 *
 * public/hero-card.png is the live /cafe-el-manar card, captured straight-on
 * and dropped into a flat frame. Straight-on because the page around it is
 * flat editorial: a tilted render with a specular highlight is exactly the
 * language this redesign took out everywhere else.
 *
 * THE CROP STAYS, because it was never decoration. The capture is 904×1906, so
 * any width that keeps the whole device makes it 2.1× as tall as it is wide.
 * The image is a window onto the top of it — the shop, the balance, the nudge,
 * the stamp row, the code and the errand — dissolving below. Height drops by
 * about a third while every pixel renders at the size it would have.
 *
 * The dissolve lands on the lilac field rather than white, which is what makes
 * it read as the card continuing past the frame instead of a hard cut. A fade
 * that stops short of true transparency looks like a rendering fault, so both
 * stops are absolute.
 */
function HeroPhone({ t }: { t: T }) {
  const HERO_FADE =
    "linear-gradient(to bottom, #000 0%, #000 var(--hero-fade), transparent 100%)";

  /*
    xl grows it, because the field it sits on does. The colour field bleeds to
    the viewport edge, so on a 1900px screen a 340px device left roughly 500px
    of empty dotted ground beyond it and the picture read as off-centre — the
    eye takes the FIELD for the frame, not the grid column the device is
    centred in.
  */
  return (
    <div className="w-full max-w-[260px] md:max-w-[310px] lg:max-w-[340px] xl:max-w-[392px]">
      <Image
        src="/hero-card.png"
        alt={t("La carte de fidélité Pointili sur un téléphone : Yassine a 118 points chez Café El Manar, son code client MEEF, et une récompense à récupérer")}
        width={904}
        height={1906}
        priority
        sizes="(max-width: 767px) 260px, (max-width: 1023px) 310px, (max-width: 1279px) 340px, 392px"
        /* The desktop crop is the deeper one so the device fills its field
           instead of sitting in a pool of empty lilac; the phone crop is
           shallower because the band it sits in is only as tall as the art.
           Both fade over the last fifth, which is a real dissolve rather than
           the abrupt edge a 90% ramp gives — that reads as a clipped image.
           The frame's own drop shadow was clipped by the element capture, so
           it is drawn here instead. */
        className="block aspect-[904/1240] h-auto w-full object-cover object-top drop-shadow-[0_18px_40px_rgba(36,18,59,.22)] [--hero-fade:80%] md:aspect-[904/1480] md:[--hero-fade:78%]"
        style={{
          maskImage: HERO_FADE,
          WebkitMaskImage: HERO_FADE,
          maskSize: "100% 100%",
          WebkitMaskSize: "100% 100%",
          /* mask-repeat defaults to `repeat`: without this the gradient tiles
             below the box and paints the shadow solid again. */
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
        }}
      />
    </div>
  );
}

/* `tight` is the masthead. The footer has a whole row to itself and keeps the
   word at every width. */
function Brand({ tight = false }: { tight?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      {/* The word goes away on phones — see BrandLockup. The mark stays, and
          the page's title and hero both say the name anyway. */}
      <BrandLockup
        size={34}
        accent="#5b3fd1"
        wordmarkClassName={tight ? "hidden sm:inline" : ""}
      />
    </span>
  );
}
