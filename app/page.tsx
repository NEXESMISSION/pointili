import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentDiner } from "@/lib/auth/diner";
import { appUrl } from "@/lib/hosts";
import { HeroArt, ShopArt } from "./LandingArt";

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
  title: "pointili.online — Une carte de fidélité, tous vos commerces",
  description:
    "La carte de fidélité sans application. Vos clients scannent un QR code, cumulent des points et récupèrent leurs récompenses. 80 TND par an, 14 jours gratuits.",
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
const CardIco = ({ className = "h-6 w-6" }: I) => <S className={className}><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19" /></S>;
const Star = ({ className = "h-6 w-6" }: I) => <S className={className}><path d="m12 3.5 2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8Z" /></S>;
const Gift = ({ className = "h-6 w-6" }: I) => <S className={className}><path d="M3.5 11h17v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" /><path d="M2.5 7.5h19V11h-19zM12 7.5V22" /><path d="M12 7.5S10.9 3.5 8.7 3.5a2.1 2.1 0 0 0 0 4.2H12Zm0 0s1.1-4 3.3-4a2.1 2.1 0 0 1 0 4.2H12Z" /></S>;
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

const STEPS = [
  { n: "01", Icon: Phone, a: "Le client scanne", b: "le QR code" },
  { n: "02", Icon: CardIco, a: "Il reçoit sa", b: "carte fidélité" },
  { n: "03", Icon: Star, a: "Il cumule", b: "des points" },
  { n: "04", Icon: Gift, a: "Il récupère", b: "sa récompense" },
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
    Customers never see the owner marketing page — straight to their wallet.

    ?pro=1 is the escape hatch: without it a device that once held a diner
    cookie could NEVER reach this page again, so an owner who is also a customer
    (or anyone on a shared phone) was locked out of signup entirely.
  */
  const { pro } = await searchParams;
  if (!pro && (await currentDiner())) redirect("/cartes");

  return (
    <div className="landing-dark min-h-dvh bg-[#070510] text-white">
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
            <Link href={appUrl("/owner/login")} className="block rounded-xl px-3 py-2.5 text-[14px] font-semibold text-white/85 hover:bg-white/[0.06]">
              Espace café
            </Link>
            <Link href={appUrl("/owner/signup")} className="mt-1 block rounded-xl bg-[#7c3aed] px-3 py-2.5 text-center text-[14px] font-bold text-white">
              Créer mon compte
            </Link>
          </nav>
        </details>
      </header>

      {/* ── hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute right-[-10%] top-[-10%] h-[560px] w-[560px] rounded-full opacity-60 blur-[90px]"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 65%)" }}
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-5 pb-10 pt-4 md:grid-cols-2 md:px-8 md:pb-20">
          <div>
            <h1 className="text-[44px] font-extrabold leading-[1.03] tracking-[-0.02em] md:text-[56px]">
              Une seule carte.
              <br />
              <span className="text-[#8b5cf6]">Toutes vos récompenses.</span>
            </h1>

            <p className="mt-6 text-[16.5px] leading-[1.75] text-white/65">
              Scannez. Cumulez des points.
              <br />
              Revenez quand vous voulez.
              <br />
              <span className="font-bold text-[#8b5cf6]">Sans application.</span>
            </p>

            <Link
              href={appUrl("/owner/signup")}
              className="mt-8 inline-flex items-center gap-2.5 rounded-2xl bg-[#7c3aed] px-7 py-4 text-[15.5px] font-bold text-white shadow-[0_18px_44px_-16px_rgba(124,58,237,.95)] transition active:scale-[0.98]"
            >
              Commencer gratuitement <Arrow />
            </Link>
            <p className="mt-3 text-[12.5px] text-white/40">
              14 jours gratuits • Sans carte bancaire
            </p>
          </div>

          <HeroArt className="mx-auto w-full max-w-[380px]" />
        </div>
      </section>

      {/* ── used by ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-10 md:px-8">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-white/35">
          Utilisé par
        </p>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {TRADES.map(({ Icon, label }) => (
            <li
              key={label}
              className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 py-7"
            >
              <Icon className="h-7 w-7 text-[#a78bfa]" />
              <span className="text-[13.5px] font-semibold text-white/80">{label}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── how it works ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-10 md:px-8">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-white/60">
          Comment <span className="text-[#8b5cf6]">ça marche</span>
        </p>

        <ol className="mt-9 grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4">
          {STEPS.map(({ n, Icon, a, b }, i) => (
            <li key={n} className="relative flex flex-col items-center text-center">
              <span className="relative">
                <span className="grid h-[74px] w-[74px] place-items-center rounded-full border border-white/[0.09] bg-white/[0.04]">
                  <Icon className="h-7 w-7 text-white" />
                </span>
                <span className="absolute -left-4 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-[#1a1330] text-[10.5px] font-bold text-white/70">
                  {n}
                </span>
              </span>
              <p className="mt-4 text-[13.5px] font-semibold leading-snug text-white/85">
                {a}
                <br />
                {b}
              </p>
              {/* the connector, on wide screens only */}
              {i < STEPS.length - 1 && (
                <span aria-hidden className="absolute right-[-14px] top-[30px] hidden text-white/20 md:block">
                  <Arrow className="h-5 w-5" />
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* ── three features ───────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-6 md:px-8">
        <ul className="grid gap-3 md:grid-cols-3">
          {FEATURES.map(({ Icon, title, text }) => (
            <li key={title} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6">
              <div className="flex items-center gap-3">
                <Icon className="h-6 w-6 shrink-0 text-[#a78bfa]" />
                <p className="text-[15.5px] font-bold text-white">{title}</p>
              </div>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-white/50">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── the argument ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-6 md:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-[#7c3aed]/30 bg-gradient-to-br from-[#2b1065] via-[#1e1046] to-[#150c33] px-7 py-9 md:px-10 md:py-12">
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full opacity-40 blur-[70px]"
            style={{ background: "radial-gradient(circle, #8b5cf6 0%, transparent 65%)" }}
          />
          <div className="relative grid gap-8 md:grid-cols-2 md:items-center">
            <h2 className="text-[30px] font-extrabold leading-[1.12] tracking-[-0.01em] md:text-[34px]">
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
      <section className="mx-auto max-w-6xl px-5 py-12 md:px-8">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-white/60">
          Un prix <span className="text-[#8b5cf6]">simple.</span>
        </p>

        <div className="mt-7 grid gap-3 md:grid-cols-[1.6fr_1fr]">
          {/* the year */}
          <div className="relative overflow-hidden rounded-3xl border border-[#7c3aed]/40 bg-gradient-to-br from-[#3b1a86] via-[#2a1263] to-[#1a0f3d] p-7 md:p-8">
            <span className="inline-block rounded-md bg-[#7c3aed] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
              Meilleure offre
            </span>

            <div className="mt-5 grid gap-7 sm:grid-cols-2 sm:items-start">
              <div>
                <p className="text-[46px] font-extrabold leading-none">
                  80 <span className="align-middle text-[15px] font-bold text-white/60">TND / an</span>
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
              href={appUrl("/owner/signup")}
              className="mt-7 flex flex-col items-center rounded-2xl bg-[#7c3aed] px-6 py-4 text-center shadow-[0_16px_38px_-16px_rgba(124,58,237,.9)] transition active:scale-[0.99]"
            >
              <span className="flex items-center gap-2 text-[15px] font-bold text-white">
                Commencer gratuitement <Arrow />
              </span>
              <span className="mt-1 text-[11.5px] text-white/65">
                14 jours gratuits • Sans carte bancaire
              </span>
            </Link>
          </div>

          {/* the half-year */}
          <div className="flex flex-col rounded-3xl border border-white/[0.07] bg-white/[0.025] p-7">
            <p className="text-[38px] font-extrabold leading-none">
              65 <span className="align-middle text-[14px] font-bold text-white/50">TND / 6 mois</span>
            </p>
            <p className="mt-3 text-[13.5px] leading-relaxed text-white/55">
              Parfait pour commencer.
            </p>
            <Link
              href={appUrl("/owner/signup")}
              className="mt-auto rounded-2xl border border-white/15 px-5 py-3.5 text-center text-[14px] font-bold text-white transition hover:bg-white/[0.05] active:scale-[0.99]"
            >
              Choisir cette offre
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
                href={appUrl("/owner/signup")}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-4 text-[15px] font-bold text-[#2a1263] transition active:scale-[0.98]"
              >
                Créer ma boutique <Arrow />
              </Link>
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-white/55">
                14 jours gratuits
                <br />
                Sans carte bancaire
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── footer ───────────────────────────────────────────────── */}
      <footer className="mx-auto flex max-w-6xl flex-col gap-4 border-t border-white/[0.07] px-5 py-7 md:flex-row md:items-center md:justify-between md:px-8">
        <div>
          <Brand />
          <p className="mt-2 text-[12px] text-white/40">Produit tunisien 🇹🇳</p>
        </div>
        {/*
          Plain text, not links: there is no privacy page and no terms page yet,
          and a link to nothing is the defect that already had to be removed from
          this footer once (three social icons that led nowhere). Each becomes a
          link the day its page exists.
        */}
        <nav className="flex flex-wrap gap-x-7 gap-y-2 text-[13px] text-white/40">
          <span>Confidentialité</span>
          <span>Conditions</span>
          <span>Contact</span>
        </nav>
      </footer>
    </div>
  );
}

function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image src="/logo-icon.png" alt="" width={30} height={30} priority className="h-[26px] w-auto" />
      <span className="text-[17px] font-extrabold tracking-[-0.02em] text-white">
        pointili<span className="text-[#8b5cf6]">.online</span>
      </span>
    </span>
  );
}
