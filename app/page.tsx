import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLockup } from "@/components/BrandMark";
import { currentDiner } from "@/lib/auth/diner";
import { Showcase } from "@/components/Showcase";
import { Compare } from "@/components/Compare";
import { hasOwnerCookie } from "@/lib/auth/owner";
import { DESCRIPTION, JsonLd, organisation, product, SITE_URL } from "@/lib/seo";
import { ShopArt } from "./LandingArt";

/**
 * The landing page, dark.
 *
 * Built to a supplied mockup, and structured around ONE argument: you already
 * have regulars — you just cannot count them. Everything on the page either
 * states the mechanic (how a card is born and how points are credited) or
 * answers a shop owner's next objection. Nothing here claims Pointili *causes*
 * a customer to return; the product has no SMS, no notification and no reminder,
 * so that promise would be one the software cannot keep.
 *
 * This root is also the BUSINESS front door. A diner who lands here already has
 * a card, so they are sent to their wallet — the two audiences never share a
 * screen. See /moi for the customer's own door.
 */

export const metadata = {
  title: "Une carte de fidélité, tous vos commerces",
  description: DESCRIPTION,
  alternates: { canonical: "/" },
};

/* ── icons, local to this page ────────────────────────────────────────── */
type I = { className?: string };
const S = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p} />
);
const Cup = ({ className = "h-6 w-6" }: I) => <S className={className}><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" /><path d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17" /><path d="M7.5 3v2M11 3v2M14.5 3v2" /></S>;
const Burger = ({ className = "h-6 w-6" }: I) => <S className={className}><path d="M4 9a8 8 0 0 1 16 0Z" /><path d="M3.5 13h17" /><path d="M4 16.5h16a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3Z" /></S>;
const Scissors = ({ className = "h-6 w-6" }: I) => <S className={className}><circle cx="6" cy="18" r="2.6" /><circle cx="18" cy="18" r="2.6" /><path d="M7.8 16.2 18 4M16.2 16.2 6 4" /></S>;
const Bag = ({ className = "h-6 w-6" }: I) => <S className={className}><path d="M5 8h14l-1 12H6Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></S>;
const Lipstick = ({ className = "h-6 w-6" }: I) => <S className={className}><path d="M9.5 10V6.5a2 2 0 0 1 2-2l3 1.2v4.3" /><rect x="8.5" y="10" width="7" height="10" rx="1.5" /></S>;
const Phone = ({ className = "h-6 w-6" }: I) => <S className={className}><rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M11 18.5h2" /></S>;
const Star = ({ className = "h-6 w-6" }: I) => <S className={className}><path d="m12 3.5 2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8Z" /></S>;
const Chart = ({ className = "h-6 w-6" }: I) => <S className={className}><path d="M5 20V11M10 20V4M15 20v-6M20 20V8" /></S>;
const Arrow = ({ className = "h-4 w-4" }: I) => <S className={className} strokeWidth="2.2"><path d="M5 12h13M12 6l6 6-6 6" /></S>;
const Check = ({ className = "h-3.5 w-3.5" }: I) => <S className={className} strokeWidth="3"><path d="m5 12.5 4.5 4.5L19 7" /></S>;

const TRADES = [
  { Icon: Cup, label: "Cafés" },
  { Icon: Burger, label: "Restaurants" },
  { Icon: Scissors, label: "Barbiers" },
  { Icon: Bag, label: "Boutiques" },
  { Icon: Lipstick, label: "Salons" },
];

const FEATURES = [
  { Icon: Phone, title: "Sans application", text: "Vos clients scannent simplement un QR code." },
  { Icon: Star, title: "Fidélité automatique", text: "Points et récompenses gérés automatiquement." },
  { Icon: Chart, title: "Analyse réelle", text: "Voyez combien de clients reviennent." },
];

const PROOF = [
  { title: "Retours clients", text: "Voyez qui revient, quand et combien." },
  { title: "Chiffre généré", text: "Mesurez l'impact de votre fidélité." },
  { title: "Récompenses utilisées", text: "Suivez ce qui motive vos clients." },
];

const INCLUDED = [
  "Programme fidélité",
  "QR Code illimité",
  "Récompenses",
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

    THE OWNER BRANCH IS NEW AND IT WAS THE BUG. The owner cookie was already
    read here, but only to STOP the diner bounce — so a signed-in owner fell
    through to the marketing page, and an owner who had installed the app opened
    it every morning onto a "Commencer gratuitement" button. Winning the tiebreak
    is not the same as being sent somewhere.

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
    page has to stop selling to somebody who already bought.

    It used to offer them "Espace café → /owner/login" and five "Commencer
    gratuitement → /owner/signup" buttons: a free trial they are already past,
    and a sign-in form they are already through. Every one of them bounced
    straight back to /owner, so nothing was broken exactly — it just made no
    sense, which is worse on the one page meant to explain the product.

    Cookie presence, not verification, same as the redirect above: this decides
    WORDING, and both destinations re-check properly.
  */
  const cta = ownerHere
    ? { href: "/owner", label: "Aller à ma caisse", note: "Vous êtes déjà connecté" }
    : {
        href: "/owner/signup",
        label: "Commencer gratuitement",
        note: "14 jours gratuits · Sans carte bancaire",
      };

  return (
    <div className="landing-dark min-h-dvh bg-[#070510] text-white">
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
      {/* ── top bar ──────────────────────────────────────────────── */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-8">
        <Brand />
        <details className="group relative">
          <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg text-white/80 [&::-webkit-details-marker]:hidden">
            <S className="h-6 w-6" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></S>
          </summary>
          {/*
            Both doors live here. The page sells to shop owners, so the customer
            link is present and plainly named rather than competing with the
            hero — a customer who needs it is looking for it.
          */}
          <nav className="absolute right-0 top-12 z-30 w-56 rounded-2xl border border-white/10 bg-[#120d22] p-2 shadow-2xl">
            <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white/35">
              Je suis client
            </p>
            <Link href="/moi" className="block rounded-xl px-3 py-2.5 text-[14px] font-semibold text-white/85 hover:bg-white/[0.06]">
              Mes cartes &amp; mes points
            </Link>
            <p className="mt-1.5 border-t border-white/10 px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.08em] text-white/35">
              Je suis commerçant
            </p>
            {ownerHere ? (
              <Link href="/owner" className="mt-1 block rounded-xl bg-[#7c3aed] px-3 py-2.5 text-center text-[14px] font-bold text-white">
                Ma caisse
              </Link>
            ) : (
              <>
                <Link href="/owner/login" className="block rounded-xl px-3 py-2.5 text-[14px] font-semibold text-white/85 hover:bg-white/[0.06]">
                  Espace café
                </Link>
                <Link href="/owner/signup" className="mt-1 block rounded-xl bg-[#7c3aed] px-3 py-2.5 text-center text-[14px] font-bold text-white">
                  Créer mon compte
                </Link>
              </>
            )}
          </nav>
        </details>
      </header>

      {/* ── hero ─────────────────────────────────────────────────── */}
      {/*
        Asymmetric on purpose: 7 columns of type against 5 of art, and the art
        runs past the right edge. A centred two-up with equal halves is the
        shape every generated page has.
      */}
      <section className="grain relative overflow-hidden">
        {/* two lights, not one blob — a warm core and a cold rim */}
        <div aria-hidden className="pointer-events-none absolute right-[-14%] top-[-24%] h-[620px] w-[620px] rounded-full opacity-70 blur-[100px]"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, rgba(124,58,237,.15) 45%, transparent 68%)" }} />
        <div aria-hidden className="pointer-events-none absolute left-[-18%] top-[38%] h-[420px] w-[420px] rounded-full opacity-40 blur-[110px]"
          style={{ background: "radial-gradient(circle, #3b1d8f 0%, transparent 70%)" }} />

        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-5 pb-14 pt-6 md:grid-cols-12 md:gap-10 md:px-8 md:pb-16 md:pt-12">
          <div className="md:col-span-7">
            <h1 className="text-[46px] font-extrabold leading-[0.98] tracking-[-0.035em] md:text-[56px] lg:text-[64px]">
              Une seule carte.
              <br />
              <span className="bg-gradient-to-r from-[#a78bfa] via-[#8b5cf6] to-[#6d28d9] bg-clip-text text-transparent">
                Toutes vos récompenses.
              </span>
            </h1>

            <p className="mt-7 max-w-[34ch] text-[17px] leading-[1.7] text-white/55">
              Scannez. Cumulez des points. Revenez quand vous voulez.{" "}
              <span className="font-semibold text-white">Sans application.</span>
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href={cta.href}
                className="group inline-flex items-center gap-2.5 rounded-full bg-[#7c3aed] px-7 py-4 text-[15px] font-bold text-white shadow-[0_20px_50px_-18px_rgba(124,58,237,1)] transition hover:bg-[#8b5cf6] active:scale-[0.98]"
              >
                {cta.label}
                <span className="transition-transform group-hover:translate-x-0.5"><Arrow /></span>
              </Link>
              <p className="text-[12.5px] text-white/35">{cta.note}</p>
            </div>
          </div>

          {/* No bleed. The art ran off the right edge to feel expansive and only
              managed to feel oversized; centred in its half it reads as an
              object on the page rather than a wall. */}
          <div className="md:col-span-5">
            <HeroStage />
          </div>
        </div>
      </section>

      {/* ── used by ──────────────────────────────────────────────── */}
      {/* One line, not five cards. This is a credential, not a feature — giving
          it the same visual weight as the pricing was the mistake. */}
      <section className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="seam" />
        <ul className="flex flex-wrap items-center justify-center gap-x-9 gap-y-5 py-8">
          <li className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/25">
            Utilisé par
          </li>
          {TRADES.map(({ Icon, label }) => (
            <li key={label} className="flex items-center gap-2.5 text-white/45 transition hover:text-white/80">
              <Icon className="h-[19px] w-[19px]" />
              <span className="text-[14px] font-medium">{label}</span>
            </li>
          ))}
        </ul>
        <div className="seam" />
      </section>

      {/* ── how it works ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-20">
        {/* A headline, not a fourth uppercase eyebrow. Repeating the same
            label treatment at every section is what flattens a page. */}
        <h2 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.025em] md:text-[38px]">
          Comment <span className="text-[#8b5cf6]">ça marche</span>
        </h2>

        <p className="mt-3 max-w-[54ch] text-[15px] leading-relaxed text-white/55">
          Rien n&apos;est dessiné ici. Chaque écran ci-dessous est le vrai produit,
          filmé en train de faire ce qu&apos;il dit.
        </p>

        <div className="mt-14">
          <Showcase />
        </div>
      </section>

      {/* ── three features ───────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-4 md:px-8">
        {/*
          Deliberately unequal. Three identical cards in a row is the single most
          generated-looking shape on the web; the first carries the claim that
          matters and gets the room to say it.

          Each card answers the cursor: it lifts, a sheen passes ONCE, the icon
          tile tilts and lights, and a hairline draws itself in. Nothing loops —
          a card shimmering forever in the corner of the eye reads as an advert.
        */}
        <ul className="grid gap-3.5 md:auto-rows-fr md:grid-cols-12">
          {FEATURES.map(({ Icon, title, text }, i) => (
            <li
              key={title}
              className={`rise card-lift group flex flex-col rounded-3xl border border-white/[0.07] bg-white/[0.02] p-7 hover:border-white/[0.16] hover:bg-white/[0.04] ${
                i === 0
                  ? "md:col-span-5 md:row-span-2 md:justify-end md:p-9"
                  : "md:col-span-7"
              }`}
              style={{ animationDelay: `${i * 90}ms` }}
            >
              {/* the light each card sits under, brightest on the wide one */}
              <span
                aria-hidden
                className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full blur-3xl transition-opacity duration-500 group-hover:opacity-70"
                style={{
                  background: "radial-gradient(circle,#7c3aed,transparent 70%)",
                  opacity: i === 0 ? 0.34 : 0.16,
                }}
              />

              <span
                className={`tile relative flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7c3aed] to-[#5b21b6] text-white shadow-[0_10px_26px_-12px_rgba(124,58,237,.9)] ${
                  i === 0 ? "h-14 w-14 md:mb-auto" : "h-12 w-12"
                }`}
              >
                <Icon className={i === 0 ? "h-7 w-7" : "h-6 w-6"} />
              </span>

              <p
                className={`relative mt-6 font-bold tracking-[-0.015em] text-white ${
                  i === 0 ? "text-[22px]" : "text-[16.5px]"
                }`}
              >
                {title}
              </p>
              <p
                className={`relative mt-2 leading-relaxed text-white/45 ${
                  i === 0 ? "max-w-[26ch] text-[15px]" : "text-[13.5px]"
                }`}
              >
                {text}
              </p>

              {/* the card's underline, drawn on hover */}
              <span
                aria-hidden
                className="mt-5 block h-px w-0 bg-gradient-to-r from-[#a78bfa] to-transparent transition-all duration-500 group-hover:w-full"
              />
            </li>
          ))}
        </ul>
      </section>

      {/* ── the argument ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        {/*
          The panel artwork carries this section — light falls off across it in a
          way a CSS gradient does not. object-cover on a 2.5:1 source, so it crops
          rather than stretches when the box gets tall on a phone.
        */}
        <div className="rise relative overflow-hidden rounded-3xl px-7 py-9 md:px-10 md:py-12">
          <Image
            src="/panel-glow.png"
            alt=""
            aria-hidden
            fill
            sizes="(max-width: 768px) 100vw, 1152px"
            className="-z-10 object-cover"
          />
          {/* keeps the copy legible wherever the artwork happens to be bright */}
          <div aria-hidden className="absolute inset-0 -z-10 bg-[#0d0722]/35" />

          <div className="relative grid gap-8 md:grid-cols-2 md:items-center">
            <h2 className="text-[32px] font-extrabold leading-[1.06] tracking-[-0.03em] md:text-[40px]">
              Vos clients
              <br />
              reviennent déjà.
              <br />
              <span className="text-[#a78bfa]">La question est :</span>
              <br />
              <span className="text-[#a78bfa]">savez-vous combien&nbsp;?</span>
            </h2>

            <ul className="space-y-5">
              {PROOF.map(({ title, text }) => (
                <li key={title} className="flex items-start gap-3.5">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#7c3aed] text-white">
                    <Check />
                  </span>
                  <span>
                    <span className="block text-[14.5px] font-bold text-white">{title}</span>
                    <span className="mt-0.5 block text-[13px] text-white/55">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── pricing ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-16 md:px-8 md:pb-24">
        <h2 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.025em] md:text-[38px]">
          Un prix <span className="text-[#8b5cf6]">simple.</span>
        </h2>
        <p className="mt-3 max-w-[42ch] text-[14.5px] leading-relaxed text-white/45">
          Pas de commission sur vos ventes. Pas de limite de clients.
        </p>

        <div className="rise mt-7 grid gap-3 md:grid-cols-[1.6fr_1fr]">
          {/* the year */}
          <div className="relative overflow-hidden rounded-3xl border border-[#7c3aed]/40 bg-gradient-to-br from-[#3b1a86] via-[#2a1263] to-[#1a0f3d] p-7 md:p-8">
            <span className="inline-block rounded-md bg-[#7c3aed] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
              Meilleure offre
            </span>

            <div className="mt-5 grid gap-7 sm:grid-cols-2 sm:items-start">
              <div>
                <p className="text-[64px] font-extrabold leading-[0.85] tracking-[-0.04em] tabular-nums">
                  80
                  <span className="ml-1.5 align-super text-[14px] font-bold tracking-normal text-white/50">
                    TND / an
                  </span>
                </p>
                <p className="mt-3 max-w-[24ch] text-[13.5px] leading-relaxed text-white/55">
                  Tout ce dont vous avez besoin pour fidéliser vos clients.
                </p>
              </div>

              <ul className="space-y-2.5">
                {INCLUDED.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-[13.5px] text-white/85">
                    <span className="text-[#a78bfa]">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <Link
              href={cta.href}
              className="mt-7 flex flex-col items-center rounded-2xl bg-[#7c3aed] px-6 py-4 text-center shadow-[0_16px_38px_-16px_rgba(124,58,237,.9)] transition active:scale-[0.99]"
            >
              <span className="flex items-center gap-2 text-[15px] font-bold text-white">
                {cta.label} <Arrow />
              </span>
              <span className="mt-1 text-[11.5px] text-white/65">{cta.note}</span>
            </Link>
          </div>

          {/* the half-year */}
          <div className="flex flex-col rounded-3xl border border-white/[0.07] bg-white/[0.025] p-7">
            <p className="text-[40px] font-extrabold leading-[0.9] tracking-[-0.03em] tabular-nums text-white/85">
              65
              <span className="ml-1.5 align-super text-[12.5px] font-bold tracking-normal text-white/40">
                TND / 6 mois
              </span>
            </p>
            <p className="mt-3 text-[13.5px] leading-relaxed text-white/55">
              Parfait pour commencer.
            </p>
            <Link
              href={cta.href}
              className="mt-auto rounded-2xl border border-white/15 px-5 py-3.5 text-center text-[14px] font-bold text-white transition hover:bg-white/[0.05] active:scale-[0.99]"
            >
              {ownerHere ? "Ma caisse" : "Choisir cette offre"}
            </Link>
          </div>
        </div>
      </section>

      {/* ── closing ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-12 md:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-[#7c3aed]/30 bg-gradient-to-br from-[#3b1a86] via-[#2a1263] to-[#1a0f3d] px-7 py-8 md:px-10">
          <div className="grid items-center gap-7 md:grid-cols-[auto_1fr_auto]">
            <ShopArt className="mx-auto w-[180px] md:mx-0" />

            <div>
              <h2 className="text-[27px] font-extrabold leading-tight md:text-[30px]">
                La fidélité
                <br />
                commence <span className="text-[#a78bfa]">aujourd&apos;hui.</span>
              </h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-white/60">
                Installez Pointili en quelques minutes.
                <br />
                Aucun matériel. Aucun engagement.
              </p>
            </div>

            <div className="text-center">
              <Link
                href={cta.href}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-4 text-[15px] font-bold text-[#2a1263] transition active:scale-[0.98]"
              >
                {ownerHere ? "Ma caisse" : "Créer ma boutique"} <Arrow />
              </Link>
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-white/55">
                {ownerHere ? (
                  "Vous êtes déjà connecté"
                ) : (
                  <>
                    14 jours gratuits
                    <br />
                    Sans carte bancaire
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── pourquoi nous, et les questions du comptoir ──────────── */}
      <Compare />

      {/* ── footer ───────────────────────────────────────────────── */}
      <footer className="mx-auto flex max-w-6xl flex-col gap-4 border-t border-white/[0.07] px-5 py-7 md:flex-row md:items-center md:justify-between md:px-8">
        <div>
          <Brand />
          <p className="mt-2 text-[12px] text-white/40">Produit tunisien 🇹🇳</p>
        </div>
        {/* Real links now — both pages exist. "Contact" stays plain text until
            there is an address to put behind it. */}
        <nav className="flex flex-wrap gap-x-7 gap-y-2 text-[13px] text-white/40">
          <Link href="/confidentialite" className="hover:text-white/70">Confidentialité</Link>
          <Link href="/conditions" className="hover:text-white/70">Conditions</Link>
          <span>Contact</span>
        </nav>
      </footer>
    </div>
  );
}

/**
 * The hero: a phone, and what happens around it.
 *
 * The render on its own is a static object in a lot of empty space. These three
 * layers give it somewhere to be, and each one says something about the product
 * rather than just moving:
 *
 *   the HALO   — the light it sits in, breathing
 *   the RING   — slow rotation, so the frame is alive without being busy
 *   the POINTS — small marks drifting upward past the phone. This is the literal
 *                picture of "cumulez des points", which beats any abstract shape
 *                because it is what the thing actually does.
 *
 * All decoration is aria-hidden: a screen reader gets the phone's alt text and
 * nothing else. And it all stops dead under prefers-reduced-motion.
 */
function HeroStage() {
  /* --hero-fade is set per breakpoint on the image, so one gradient serves both
     crop depths. Two stops only: solid to true transparent at the box edge. */
  const HERO_FADE =
    "linear-gradient(to bottom, #000 0%, #000 var(--hero-fade), transparent 100%)";

  /* Deterministic, not random: a fresh layout every render would make the
     server and client HTML disagree and hydration would complain. */
  const points = [
    { left: "6%",  bottom: "18%", size: 13, delay: "0s",   dur: "7.5s" },
    { left: "16%", bottom: "42%", size: 9,  delay: "1.6s", dur: "6.4s" },
    { left: "2%",  bottom: "62%", size: 11, delay: "3.1s", dur: "8.2s" },
    { left: "84%", bottom: "26%", size: 10, delay: "0.9s", dur: "7.1s" },
    { left: "92%", bottom: "54%", size: 14, delay: "2.4s", dur: "8.8s" },
    { left: "76%", bottom: "72%", size: 8,  delay: "4.2s", dur: "6.9s" },
  ];

  /* Cropped, not shrunk — that distinction is the whole fix.

     The render is 585×1090, a 0.537 aspect ratio, so ANY width that keeps the
     whole device keeps it 1.86× as tall as it is wide. Two rounds of shrinking
     made the art quieter and the product less legible at the same time, which
     is the worst trade available: you pay in credibility for something a crop
     gives away free.

     So the width stays and the END moves. The image is a window onto the top of
     the render — the shop, the name, 230 points, the full stamp card — and
     dissolves below it. Height drops ~40% while every pixel of the card renders
     at exactly the size it did before.

     The fade is not decoration. A hard cut across a device reads as a broken
     image; a dissolve reads as "the app continues", which is true. It has to
     reach real transparency at the box edge — a fade that stops at 15% alpha
     looks like a rendering fault.

     Mobile crops harder (585/700) than desktop (585/900) for a different
     reason: a phone-shaped object at 90% of a phone's width is a phone inside
     a phone. Killing the portrait silhouette is what fixes that, not size. */
  return (
    <div className="relative mx-auto w-full max-w-[250px] md:max-w-[280px] lg:max-w-[300px]">
      {/* the light it sits in */}
      <div
        aria-hidden
        className="halo pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[112%] w-[112%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[64px]"
        style={{ background: "radial-gradient(circle, rgba(124,58,237,.7) 0%, rgba(124,58,237,.14) 46%, transparent 68%)" }}
      />

      {/* a ring, turning slowly */}
      <div
        aria-hidden
        className="orbit pointer-events-none absolute left-1/2 top-1/2 -z-10 aspect-square w-[104%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(167,139,250,.34) 40deg, transparent 110deg, transparent 250deg, rgba(124,58,237,.22) 300deg, transparent 350deg)",
          maskImage: "radial-gradient(circle, transparent 61%, #000 62%, #000 63.4%, transparent 64.4%)",
          WebkitMaskImage: "radial-gradient(circle, transparent 61%, #000 62%, #000 63.4%, transparent 64.4%)",
        }}
      />

      {/* points, rising past it */}
      {points.map((p, i) => (
        <span
          key={i}
          aria-hidden
          className="spark pointer-events-none absolute -z-10 rounded-full bg-[#c4b5fd]"
          style={{
            left: p.left,
            bottom: p.bottom,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            animationDuration: p.dur,
            boxShadow: "0 0 14px 3px rgba(167,139,250,.6)",
          }}
        />
      ))}

      {/* The float and the shadow live on the wrapper, not on the image.
          `mask` is applied after `filter`, so a shadow set on the masked image
          is eaten by its own mask; on the parent it reads the already-faded
          alpha and dies out with the artwork. */}
      <div className="float relative drop-shadow-[0_26px_60px_rgba(88,28,235,.45)]">
        <Image
          src="/hero-phone-v2.png"
          alt="La carte de fidélité Pointili sur un téléphone : Yassine a 230 points et 7 tampons sur 10 chez Café El Ali"
          width={585}
          height={1090}
          priority
          sizes="(max-width: 767px) 250px, (max-width: 1023px) 280px, 300px"
          className="block aspect-[585/700] h-auto w-full object-cover object-top [--hero-fade:80%] md:aspect-[585/900] md:[--hero-fade:85%]"
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
    </div>
  );
}

function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandLockup size={34} accent="#8b5cf6" />
    </span>
  );
}
