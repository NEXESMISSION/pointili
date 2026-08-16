import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLockup } from "@/components/BrandMark";
import { currentDiner } from "@/lib/auth/diner";
import { Showcase } from "@/components/Showcase";
import { Compare } from "@/components/Compare";
import { Dressed } from "@/components/Dressed";
import { AudienceProvider, AudienceTabs, ForCustomer, ForOwner } from "@/components/Audience";
import { hasOwnerCookie } from "@/lib/auth/owner";
import { DESCRIPTION, JsonLd, organisation, product, SITE_URL } from "@/lib/seo";
import { currentLang, dir, translator } from "@/lib/i18n";
import { LangToggle } from "@/components/LangToggle";

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
 * THE ORDER CHANGED TOO, and that mattered more than the pixels:
 *
 *   was: hero → fake logo strip → clips → 3 abstract feature cards → a dark
 *        panel making the SAME argument as the hero → price → closing CTA →
 *        comparison table → FAQ
 *
 *   now: hero → who it is for → the mechanic (01/02/03) → what you learn →
 *        the clips → the comparison → the FAQ → the price → closing CTA
 *
 * Three things fixed by that. The hero's argument was being restated twice
 * more in different card shapes, so the two restatements are gone and the one
 * survivor says something new. The objections — the carton comparison and the
 * eight counter questions — used to sit AFTER the closing call to action,
 * which asks for the sale before answering why; they now come before the
 * price. And the mechanic ("he gives his number, you type dinars, the server
 * counts") was buried four screens down behind three adjectives; it is now
 * the first thing after the hero, because it is the first thing anyone asks.
 *
 * This root is also the BUSINESS front door. A diner who lands here already
 * has a card, so they are sent to their wallet — the two audiences never share
 * a screen. See /moi for the customer's own door.
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

/*
  "FAIT POUR", not "UTILISÉ PAR" — and that is a correction, not a rewrite.

  This row sits in the slot a reader's eye reads as social proof, and it was
  filled with the names of TRADES. Nobody in that list is a customer; they are
  categories. Claiming otherwise in the one place a visitor looks for evidence
  is the fastest way to lose them, and dressing each one in a little outlined
  icon made it look even more like a logo wall.

  So it says what it actually is — the shops this is built for — set as one
  line of type, which is also all a category list deserves.
*/
const TRADES = ["Cafés", "Restaurants", "Barbiers", "Boutiques", "Salons"];

/*
  THE MECHANIC, in the order it happens at the counter.

  This replaces three cards that read "Sans application / Fidélité automatique
  / Analyse réelle" — three abstract nouns and a gloss each, which is what a
  page writes when it has nothing concrete to say. Everything below is a
  checkable claim about what the software does, lifted from the same source of
  truth the demo clips are captured against.
*/
const STEPS_OWNER = [
  {
    title: "Il donne son numéro",
    text: "Pas de carte à sortir, rien à ouvrir. Huit chiffres — ou son code à quatre caractères, s'il l'a devant lui.",
  },
  {
    title: "Vous tapez des dinars",
    text: "Le montant de l'addition, comme sur votre calculette. Jamais des points : vous n'avez rien à convertir.",
  },
  {
    title: "Le serveur compte",
    text: "Le calcul se fait chez nous, à votre taux. Personne au comptoir n'invente un solde, et personne ne peut le corriger en douce.",
  },
];

const STEPS_CUSTOMER = [
  {
    title: "Vous scannez le QR",
    text: "Celui qui est posé sur la table ou collé à la caisse. Votre carte s'ouvre dans le navigateur.",
  },
  {
    title: "Un numéro, un code secret",
    text: "Pas d'e-mail, pas de mot de passe à retenir, rien à télécharger. Le bonus de bienvenue arrive tout de suite.",
  },
  {
    title: "Vos points vous attendent",
    text: "Une carte par commerce, toutes dans le même téléphone. Ils n'expirent pas.",
  },
];

/*
  WHAT THE ANALYTICS SCREEN ACTUALLY SHOWS.

  The old version of this section was a dark panel headed "Vos clients
  reviennent déjà. La question est : savez-vous combien ?" — which is the hero
  headline again, one screen later — over three lines as vague as the cards
  above it ("Chiffre généré. Mesurez l'impact de votre fidélité.").

  These are the four figures on the real screen, named the way the screen
  names them. A shop owner can check every one of them inside the trial.
*/
const LEARN = [
  { term: "Taux de retour", def: "La part de vos clients qui sont revenus. Sur 7 jours, 30 jours, ou depuis le début — avec l'écart par rapport à la période d'avant." },
  { term: "Visites", def: "Combien de passages ce mois-ci, et combien de clients différents les ont faits." },
  { term: "Nouveaux clients", def: "Combien de cartes créées, et à quel rythme elles arrivent." },
  { term: "Récompenses utilisées", def: "Laquelle marche vraiment, et laquelle dort depuis trois mois." },
];

const INCLUDED = [
  "Programme fidélité",
  "QR Code illimité",
  "Récompenses",
  "Carte à vos couleurs",
  "Français et tunisien",
  "Analyses et statistiques",
  "Support en Tunisie",
];

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

  const cta = ownerHere
    ? { href: "/owner", label: t("Aller à ma caisse"), note: t("Vous êtes déjà connecté") }
    : {
        href: "/owner/signup",
        label: t("Commencer gratuitement"),
        note: t("14 jours gratuits · Sans carte bancaire"),
      };

  return (
    <AudienceProvider>
    {/*
      dir and lang-tn both live on THIS element, not on <html>.

      It is the pattern app/[slug]/layout.tsx already uses — each section of
      the product owns its own direction — and it is also what makes the
      typography fix in globals.css work: `.landing-light.lang-tn` needs both
      classes on one element to out-specify `.landing-light h1`, which would
      otherwise set every Arabic heading in a face that has no Arabic in it.
    */}
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
              inLanguage: "fr",
              publisher: { "@id": `${SITE_URL}/#organization` },
            },
          ],
        }}
      />

      {/* ── masthead ─────────────────────────────────────────────────
          A rule under the header, the way a printed page rules off its
          masthead. It also does a real job: it draws the top edge of the
          hero's colour field, so the field reads as a panel that was placed
          rather than a tint that leaked. */}
      <header className="border-b border-hair">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 md:px-8">
          <Brand />
          <AudienceTabs className="hidden sm:flex" />
          {/* Before the way in, not after it: a reader who cannot read the
              page needs the language before they need the sign-in button, and
              on a phone the masthead is the only place they will look. */}
          <LangToggle current={lang} className="ms-auto sm:ms-0" />
          {/*
            A BUTTON, because it is the way in.

            This was 11.5px letterspaced uppercase mono in grey — the quietest
            thing in the row, and for a signed-in owner "Ma caisse" is the most
            useful link on the whole page. Nothing about it said it could be
            pressed. Bordered rather than filled so it does not outrank the
            hero's call to action, sentence case so it can simply be read.
          */}
          <ForOwner>
            <Link
              href={ownerHere ? "/owner" : "/owner/login"}
              className="shrink-0 whitespace-nowrap rounded-[3px] border border-charcoal px-4 py-2 text-[13.5px] font-bold text-charcoal transition hover:bg-charcoal hover:text-white"
            >
              {ownerHere ? "Ma caisse" : "Espace café"}
            </Link>
          </ForOwner>
          <ForCustomer>
            <Link
              href="/moi"
              className="shrink-0 whitespace-nowrap rounded-[3px] border border-charcoal px-4 py-2 text-[13.5px] font-bold text-charcoal transition hover:bg-charcoal hover:text-white"
            >
              Mes cartes
            </Link>
          </ForCustomer>
        </div>
      </header>

      {/* ── hero ─────────────────────────────────────────────────────
          Type on paper, art in a colour field with a hard left edge that lines
          up exactly with the grid column. What was here before was a violet
          wash bleeding out of two 640px blurred circles — soft everywhere, so
          nothing had an edge and the headline sat in a bruise. */}
      <section className="relative overflow-hidden border-b border-hair">
        <div className="mx-auto grid max-w-6xl items-stretch px-5 md:grid-cols-12 md:px-8">
          <div className="pb-12 pt-12 md:col-span-7 md:pb-24 md:pr-12 md:pt-24">
            {/* the switch, again, on phones — where the header version is
                hidden. Full width and full labels: here it has the column. */}
            <AudienceTabs full className="mb-9 flex w-full sm:hidden" />

            <p className="flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-royal">
              <span aria-hidden className="h-px w-7 bg-royal" />
              Fait en Tunisie, pour la Tunisie
            </p>

            {/*
              THE HEADLINE ADDRESSES THE PERSON WHO WAS CHOSEN, and it does it
              in one colour. The second line used to be filled with a
              three-stop gradient clipped through the glyphs — the single most
              recognisable tell of a generated page, and on a serif it would be
              worse. Royal is a colour the rest of the product already uses to
              mean "this is the point".
            */}
            <ForOwner>
              <h1 className="mt-6 text-[38px] md:text-[52px] lg:text-[58px]">
                Vos habitués reviennent.
                <br />
                <span className="text-royal">Vous saurez enfin lesquels.</span>
              </h1>
              <p className="mt-6 max-w-[44ch] text-[16px] leading-[1.65] text-slate">
                La carte de fidélité de votre commerce, dans le téléphone de vos
                clients.{" "}
                <span className="font-semibold text-charcoal">
                  Aucune application
                </span>{" "}
                — ni pour eux, ni pour vous.
              </p>
            </ForOwner>

            <ForCustomer>
              <h1 className="mt-6 text-[38px] md:text-[52px] lg:text-[58px]">
                Vos points,
                <br />
                <span className="text-royal">dans tous vos commerces.</span>
              </h1>
              <p className="mt-6 max-w-[44ch] text-[16px] leading-[1.65] text-slate">
                Un numéro, un code secret, et vos cartes sont là.{" "}
                <span className="font-semibold text-charcoal">
                  Rien à installer.
                </span>
              </p>
            </ForCustomer>

            {/* A block, not a pill with a glow under it. Printed matter sets a
                call to action as a solid rectangle of ink; the halo shadow was
                doing the same job the gradient was — making a button look
                expensive instead of making it look pressable. */}
            <div className="mt-10">
              <ForOwner>
                <Link
                  href={cta.href}
                  className="group inline-flex items-center gap-3 rounded-[3px] bg-royal px-8 py-4 text-[15px] font-bold text-white transition hover:bg-[#4c33b4] active:translate-y-px"
                >
                  {cta.label}
                  <Arrow className="cta-arrow h-4 w-4" />
                </Link>
                <p className="mt-4 text-[13px] text-slate">
                  {cta.note}
                </p>
              </ForOwner>

              {/* A customer here is looking for their card, not for a pitch. */}
              <ForCustomer>
                <Link
                  href="/moi"
                  className="group inline-flex items-center gap-3 rounded-[3px] bg-royal px-8 py-4 text-[15px] font-bold text-white transition hover:bg-[#4c33b4] active:translate-y-px"
                >
                  Ouvrir mes cartes
                  <Arrow className="cta-arrow h-4 w-4" />
                </Link>
                <p className="mt-4 text-[13px] text-slate">
                  Ou scannez le QR posé sur votre table
                </p>
              </ForCustomer>
            </div>
          </div>

          {/*
            The colour field is a child of the ART COLUMN, not of the section,
            so its left edge is the grid line — exactly where the type column
            ends — at every viewport, with no percentage guessing. It bleeds
            right past the container into the section's overflow-hidden, and on
            phones -left-5 cancels the container padding so it becomes a plain
            full-bleed band with the phone in it.
          */}
          <div className="relative md:col-span-5">
            {/* Logical, not physical. As `-left-5 … right-[-50vw]` this band
                bled to the right whatever the direction — so in Arabic, where
                the art column sits on the LEFT, it bled straight across the
                text column and painted the headline out. start/end put the
                bleed on the outside edge in both directions. */}
            <div aria-hidden className="absolute -start-5 inset-y-0 -end-[50vw] bg-mist md:start-0" />
            <div className="relative flex justify-center pt-10 md:h-full md:items-end md:pt-0">
              <HeroPhone />
            </div>
          </div>
        </div>
      </section>

      {/* ── who it is for ────────────────────────────────────────────
          One ruled line. It used to be five outlined icons in the social-proof
          slot under the words "Utilisé par", which promised customers and
          delivered a taxonomy. */}
      <section className="border-b border-hair">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 md:flex-row md:items-baseline md:gap-10 md:px-8">
          <p className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-slate">
            Fait pour
          </p>
          {/* The separator TRAILS its word instead of leading the next one.
              Leading, it wrapped onto the next line on a 390px screen and the
              list ended "· Salons" — a dot hanging at the start of a line
              reads as a bullet, or as a typo. Trailing, it can only ever
              dangle at the end of a line, which is what punctuation does. */}
          <ul className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px] text-charcoal">
            {TRADES.map((t, i) => (
              <li key={t}>
                {t}
                {i < TRADES.length - 1 && (
                  <span aria-hidden className="ml-2 text-royal">·</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── the mechanic ─────────────────────────────────────────────
          A field of deep ink, full bleed, numbered. This is the answer to the
          first question anybody has about a loyalty product — what happens at
          the till — and it used to be four screens down. */}
      <section className="bg-deep text-white">
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-lavender">
            <ForOwner>Au comptoir</ForOwner>
            <ForCustomer>Sur votre téléphone</ForCustomer>
          </p>
          <h2 className="mt-5 max-w-[20ch] text-[32px] text-white md:text-[44px]">
            <ForOwner>Trois gestes, cinq secondes.</ForOwner>
            <ForCustomer>Trois gestes, une seule fois.</ForCustomer>
          </h2>
          <p className="mt-5 max-w-[52ch] text-[15.5px] leading-relaxed text-white/60">
            <ForOwner>
              Pendant que vous rendez la monnaie. Pas de matériel, pas de
              lecteur, pas de caisse à changer — votre téléphone suffit.
            </ForOwner>
            <ForCustomer>
              Après ça, votre carte est là à chaque passage : vous donnez votre
              numéro, et c&apos;est tout.
            </ForCustomer>
          </p>

          <ForOwner>
            <Steps steps={STEPS_OWNER} />
          </ForOwner>
          <ForCustomer>
            <Steps steps={STEPS_CUSTOMER} />
          </ForCustomer>
        </div>
      </section>

      {/* ── what you learn ───────────────────────────────────────────
          Owner-only, and the one survivor of the three sections that all made
          the hero's argument again. It survives because it stopped restating
          the claim and started listing the evidence. */}
      <ForOwner>
        <section className="bg-mist">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 md:grid-cols-12 md:px-8 md:py-24">
            <div className="md:col-span-5">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-royal">
                Ce que vous ne savez pas
              </p>
              <h2 className="mt-5 text-[30px] md:text-[40px]">
                Vous connaissez vos habitués. Vous ne savez pas combien sont
                revenus.
              </h2>
              <p className="mt-5 max-w-[42ch] text-[15.5px] leading-relaxed text-charcoal/65">
                Le carton ne compte pas, et personne n&apos;a jamais tenu ce
                registre à la main. Voilà les quatre chiffres qui apparaissent
                dans votre espace, sans que vous ayez rien à saisir.
              </p>
            </div>

            <ul className="border-t border-charcoal/15 md:col-span-7">
              {LEARN.map(({ term, def }, i) => (
                <li
                  key={term}
                  className="grid grid-cols-[auto_1fr] gap-x-5 border-b border-charcoal/15 py-5"
                >
                  <span className="mt-[3px] font-mono text-[12px] font-bold tabular-nums text-royal">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span className="block text-[16px] font-bold text-charcoal">
                      {term}
                    </span>
                    <span className="mt-1 block text-[14.5px] leading-relaxed text-charcoal/65">
                      {def}
                    </span>
                  </span>
                </li>
              ))}
              {/*
                THE LIMIT, PRINTED WITH THE FEATURE. This is the honest half of
                an analytics claim and it is genuinely in the code — under five
                customers the screen refuses to give a rate. Saying so here
                costs nothing and is the difference between a number you can
                trust and a number you were sold.
              */}
              <li className="pt-5 text-[13.5px] leading-relaxed text-charcoal/55">
                En dessous de cinq clients, l&apos;écran affiche «&nbsp;Trop tôt
                pour conclure&nbsp;» au lieu d&apos;un taux. Un chiffre sur
                quatre passages ne veut rien dire, et nous préférons le dire.
              </li>
            </ul>
          </div>
        </section>
      </ForOwner>

      {/* ── the product, filmed ──────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-royal">
          Le produit, filmé
        </p>
        <h2 className="mt-5 max-w-[18ch] text-[32px] md:text-[44px]">
          Rien n&apos;est dessiné ici.
        </h2>
        <p className="mt-5 max-w-[54ch] text-[15.5px] leading-relaxed text-slate">
          Chaque écran ci-dessous est le vrai produit, filmé en train de faire
          ce qu&apos;il dit.{" "}
          <ForOwner>
            <span className="font-semibold text-charcoal">Voici votre caisse.</span>
          </ForOwner>
          <ForCustomer>
            <span className="font-semibold text-charcoal">Voici votre téléphone.</span>
          </ForCustomer>
        </p>

        <div className="mt-14">
          <Showcase />
        </div>
      </section>

      {/* ── whose card is it ────────────────────────────────────────
          Straight after the filmed product, because the question the clips
          raise is "yes, but that is YOUR card" — and the answer is three of
          them. Shown to both audiences: a customer reading this page is being
          told their card will look like the shop they already go to. */}
      <Dressed />

      {/* ── the objections, then the price ───────────────────────────
          Both of these used to sit AFTER the closing call to action — the page
          asked for the sale, then explained why. Owner-only, obviously: a
          customer weighing Pointili against a paper punch card is not a person
          who exists, and they never pay anything. */}
      <ForOwner>
        <Compare />

        <section className="border-t border-hair">
          <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-royal">
              Le prix
            </p>
            <h2 className="mt-5 text-[32px] md:text-[44px]">Un prix simple.</h2>
            <p className="mt-5 max-w-[44ch] text-[15.5px] leading-relaxed text-slate">
              Pas de commission sur vos ventes. Pas de limite de clients. Pas de
              palier qui se déclenche le jour où ça marche.
            </p>

            {/*
              HOW YOU ACTUALLY PAY — the question this page never answered.

              Every price on it was a number with no mechanism behind it, and
              the mechanism is the objection: a café owner in Tunisia does not
              have a card they will type into a website, and a page that only
              shows a price is quietly asking for one. D17, Flouci and a
              transfer are what they already use, and the renewal screen in the
              app now takes the receipt (voir /owner/renouveler).
            */}
            <p className="mt-4 max-w-[52ch] text-[14px] leading-relaxed text-slate">
              <span className="font-semibold text-charcoal">
                Vous payez par D17, Flouci ou virement.
              </span>{" "}
              Vous envoyez la photo du reçu depuis l&apos;application, et votre
              compte est prolongé — pas de carte bancaire, pas de prélèvement
              qui se renouvelle tout seul.
            </p>

            {/* items-start, so the smaller offer is only as tall as it needs to
                be. Stretched to match the year it grew a 250px hole between its
                one paragraph and a button pinned to the bottom by mt-auto. */}
            <div className="mt-10 grid gap-5 md:grid-cols-[1.6fr_1fr] md:items-start">
              {/* the year — a block of ink, not a three-stop gradient */}
              <div className="rounded-[3px] bg-deep p-7 text-white md:p-9">
                <p className="inline-block bg-royal px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                  Meilleure offre
                </p>

                <div className="mt-7 grid gap-8 sm:grid-cols-2 sm:items-start">
                  <div>
                    <p className="display text-[68px] leading-[0.85] tabular-nums">
                      80
                      <span className="ml-2 align-super font-mono text-[13px] font-bold uppercase tracking-[0.1em] text-lavender">
                        TND / an
                      </span>
                    </p>
                    <p className="mt-4 max-w-[24ch] text-[14px] leading-relaxed text-white/60">
                      Tout ce dont vous avez besoin pour fidéliser vos clients.
                    </p>
                  </div>

                  <ul className="border-t border-white/15">
                    {INCLUDED.map((f) => (
                      <li
                        key={f}
                        className="flex items-center gap-3 border-b border-white/15 py-2.5 text-[14px] text-white"
                      >
                        <Check className="h-3.5 w-3.5 shrink-0 text-lavender" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href={cta.href}
                  className="group mt-8 flex flex-col items-center rounded-[3px] bg-royal px-6 py-4 text-center transition hover:bg-[#4c33b4] active:translate-y-px"
                >
                  <span className="flex items-center gap-2.5 text-[15px] font-bold text-white">
                    {cta.label} <Arrow className="cta-arrow h-4 w-4" />
                  </span>
                  <span className="mt-1.5 text-[12.5px] text-white/70">
                    {cta.note}
                  </span>
                </Link>
              </div>

              {/* the half-year */}
              <div className="flex flex-col rounded-[3px] border border-hair p-7">
                <p className="display text-[44px] leading-[0.85] tabular-nums text-charcoal">
                  65
                  <span className="ml-2 align-super font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-slate">
                    TND / 6 mois
                  </span>
                </p>
                <p className="mt-4 text-[14px] leading-relaxed text-slate">
                  Parfait pour commencer. Les mêmes fonctions, la même
                  assistance — vous payez juste plus souvent.
                </p>
                <Link
                  href={cta.href}
                  className="mt-7 rounded-[3px] border border-charcoal px-5 py-3.5 text-center text-[14px] font-bold text-charcoal transition hover:bg-charcoal hover:text-white active:translate-y-px"
                >
                  {ownerHere ? "Ma caisse" : "Choisir cette offre"}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </ForOwner>

      {/* ── closing ──────────────────────────────────────────────────
          The last field of ink, and the last word. The little drawn shop that
          used to sit here called itself a placeholder in its own header and
          read as clip art beside nine clips of the real thing, so it is gone
          and its file with it — a closing argument is stronger set in type. */}
      <section className="bg-deep text-white">
        <div className="mx-auto grid max-w-6xl items-end gap-10 px-5 py-16 md:grid-cols-12 md:px-8 md:py-24">
          <div className="md:col-span-7">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-lavender">
              Commencer
            </p>
            <h2 className="mt-5 text-[34px] text-white md:text-[46px]">
              La fidélité commence aujourd&apos;hui.
            </h2>
            <p className="mt-5 max-w-[46ch] text-[15.5px] leading-relaxed text-white/60">
              Vous créez votre espace, vous réglez vos récompenses, vous
              imprimez votre QR. Aucun matériel, aucun engagement, et vos
              habitués n&apos;ont rien à installer.
            </p>
          </div>

          <div className="md:col-span-5 md:justify-self-end md:text-right">
            <Link
              href={cta.href}
              className="group inline-flex items-center gap-3 rounded-[3px] bg-white px-8 py-4 text-[15px] font-bold text-deep transition hover:bg-lilac active:translate-y-px"
            >
              {ownerHere ? "Ma caisse" : "Créer ma boutique"}
              <Arrow className="cta-arrow h-4 w-4" />
            </Link>
            <p className="mt-4 text-[13px] text-white/60">
              {cta.note}
            </p>
          </div>
        </div>
      </section>

      {/* ── footer ───────────────────────────────────────────────────
          "Produit tunisien 🇹🇳" lost its flag on purpose: Windows ships no
          regional-indicator glyphs, so on the desktop most of this audience
          browses from it rendered as the two bare letters "TN" next to the
          word — which reads as a rendering fault, not a credential. */}
      <footer className="border-t border-hair">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <Brand />
            <p className="mt-3 text-[13px] text-slate">
              Conçu et hébergé pour la Tunisie
            </p>
          </div>
          {/* py-2 on the links, not just on the row: they were 22px tall, and a
              22px target is a miss on a phone. The padding costs nothing here
              and takes both to 40. */}
          <nav className="flex flex-wrap items-center gap-x-8 text-[13.5px] text-slate">
            <Link href="/confidentialite" className="py-2 transition hover:text-charcoal">
              Confidentialité
            </Link>
            <Link href="/conditions" className="py-2 transition hover:text-charcoal">
              Conditions
            </Link>
            <span className="py-2">Contact</span>
          </nav>
        </div>
      </footer>
    </div>
    </AudienceProvider>
  );
}

/**
 * The numbered mechanic — № 01 rather than a badge, which is the house style
 * components/icons.tsx wrote down and this page had drifted away from.
 *
 * Three columns ruled apart on desktop, three ruled rows on a phone. The rules
 * are the layout: no cards, no borders that go all the way round, nothing
 * floating. Extracted rather than inlined twice because the owner and the
 * customer each get their own three steps and only the words differ.
 */
function Steps({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <ol className="mt-12 grid border-t border-white/20 md:mt-16 md:grid-cols-3">
      {steps.map((s, i) => (
        <li
          key={s.title}
          className="border-b border-white/20 py-7 md:border-b-0 md:border-r md:px-8 md:py-0 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
        >
          <p className="font-mono text-[12px] font-bold tracking-[0.2em] text-lavender md:pt-8">
            {String(i + 1).padStart(2, "0")}
          </p>
          <h3 className="mt-4 text-[23px] text-white md:text-[25px]">{s.title}</h3>
          <p className="mt-3 text-[14.5px] leading-relaxed text-white/60">{s.text}</p>
        </li>
      ))}
    </ol>
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
function HeroPhone() {
  const HERO_FADE =
    "linear-gradient(to bottom, #000 0%, #000 var(--hero-fade), transparent 100%)";

  return (
    <div className="w-full max-w-[260px] md:max-w-[310px] lg:max-w-[340px]">
      <Image
        src="/hero-card.png"
        alt="La carte de fidélité Pointili sur un téléphone : Yassine a 118 points chez Café El Manar, son code client MEEF, et une récompense à récupérer"
        width={904}
        height={1906}
        priority
        sizes="(max-width: 767px) 260px, (max-width: 1023px) 310px, 340px"
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

function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandLockup size={34} accent="#5b3fd1" />
    </span>
  );
}
