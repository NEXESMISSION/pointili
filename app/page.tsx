import Image from "next/image";
import Link from "next/link";

/**
 * Marketing landing — the real pointili.online brand (modern, Royal Mauve, Poppins).
 * Rebuilt to match the mockup; mobile-first. Not Le Ticket — this is the brand
 * guide's identity. §01 lists a landing page as out of scope; built on request.
 */

export const metadata = {
  title: "pointili.online — Vos clients de passage, en habitués",
  description:
    "Le programme de fidélité pour cafés, restaurants et commerçants : points à la caisse, roue à gagner, récompenses réelles, et les analyses qui prouvent que vos clients reviennent. Sans app à installer.",
};

/* — marketing-only icons, kept local — */
type I = { className?: string };
const Clock = ({ className = "h-5 w-5" }: I) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className={className} aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
const Smile = ({ className = "h-5 w-5" }: I) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className={className} aria-hidden><circle cx="12" cy="12" r="9" /><path d="M8.5 14a4 4 0 0 0 7 0" /><path d="M9 9.5h.01M15 9.5h.01" /></svg>
);
const Shield = ({ className = "h-5 w-5" }: I) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" className={className} aria-hidden><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" /><path d="m9 12 2 2 4-4" strokeLinecap="round" /></svg>
);
const Cup = ({ className = "h-6 w-6" }: I) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" /><path d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17" /><path d="M7.5 2.5v2M11 2.5v2M14.5 2.5v2" /></svg>
);
const Qr = ({ className = "h-6 w-6" }: I) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" className={className} aria-hidden><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3h-3zM18 18h3v3h-3z" strokeLinecap="round" /></svg>
);
const Gift = ({ className = "h-6 w-6" }: I) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" className={className} aria-hidden><path d="M3 11h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z" /><path d="M2.5 7.5h19V11h-19zM12 7.5V22" /><path d="M12 7.5S10.8 3 8.4 3a2.3 2.3 0 0 0 0 4.5H12Zm0 0S13.2 3 15.6 3a2.3 2.3 0 0 1 0 4.5H12Z" /></svg>
);
const Chart = ({ className = "h-6 w-6" }: I) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d="M4 20V10M10 20V4M16 20v-7M4 20h16" /><path d="m5 9 4-4 4 3 5-6" /></svg>
);
const Arrow = ({ className = "h-4 w-4" }: I) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

function BrandMark({ dark = false }: { dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Image src="/logo-icon.png" alt="" width={30} height={30} priority className="h-[26px] w-auto" />
      <span className={`text-[19px] font-extrabold tracking-[-0.02em] ${dark ? "text-white" : "text-charcoal"}`}>
        pointili<span className="text-royal2">.online</span>
      </span>
    </span>
  );
}

const steps = [
  { n: "01", Icon: Cup, title: "Le client consomme", text: "Comme d'habitude." },
  { n: "02", Icon: Qr, title: "Vous créditez ses points", text: "À la caisse, en 5 secondes." },
  { n: "03", Icon: Gift, title: "Il joue & gagne", text: "Il tourne la roue — tout le monde gagne quelque chose." },
  { n: "04", Icon: Chart, title: "Vous suivez les résultats", text: "Il échange ses points contre du réel. Et il revient." },
];

const trust = [
  { Icon: Clock, label: "Mise en place\nen 5 min" },
  { Icon: Smile, label: "Sans\nengagement" },
  { Icon: Shield, label: "Support\nréactif" },
];

export default function Landing() {
  return (
    <div className="modern min-h-dvh bg-white">
      {/* ── top bar ─────────────────────────────────────────── */}
      <header className="mx-auto flex max-w-md items-center justify-between px-5 py-4">
        <BrandMark />
        <details className="group relative">
          <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-xl text-charcoal [&::-webkit-details-marker]:hidden">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </summary>
          <nav className="absolute right-0 top-12 z-30 w-48 rounded-2xl border border-hair bg-white p-2 shadow-[0_20px_50px_-20px_rgba(40,18,59,.35)]">
            <Link href="/owner/login" className="block rounded-xl px-3 py-2.5 text-[14px] font-semibold text-charcoal hover:bg-lilac-2">Espace café</Link>
            <Link href="/owner/signup" className="mt-1 block rounded-xl bg-royal px-3 py-2.5 text-center text-[14px] font-bold text-white">Créer mon compte</Link>
          </nav>
        </details>
      </header>

      {/* ── hero ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-md px-5 pt-3 pb-2">
        <span className="inline-block rounded-full bg-lilac px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-royal">
          Pour les entreprises &amp; commerçants
        </span>

        <h1 className="mt-5 text-[40px] font-extrabold leading-[1.05] text-charcoal">
          Vos clients de passage,
          <br />
          <span className="text-royal">en habitués.</span>
        </h1>

        <p className="mt-4 text-[15.5px] leading-relaxed text-slate">
          Ils gagnent des points en consommant, jouent et repartent avec de
          vraies récompenses — chez vous.
        </p>
        <p className="mt-3 text-[15.5px] leading-relaxed text-slate">
          Et vous voyez enfin, chiffres à l&apos;appui, s&apos;ils reviennent.
        </p>

        {/* the product, illustrated */}
        <div className="mt-7 overflow-hidden rounded-[26px]">
          <Image
            src="/hero-barista.png"
            alt="Un client scanne sa carte de fidélité au comptoir"
            width={1464}
            height={1074}
            priority
            className="w-full"
          />
        </div>

        {/* CTAs */}
        <div className="mt-7 space-y-3">
          <Link
            href="/owner/signup"
            className="flex items-center justify-center gap-2 rounded-2xl bg-royal py-4 text-[15.5px] font-bold text-white shadow-[0_12px_28px_-10px_rgba(91,63,209,.6)] active:scale-[0.99]"
          >
            Créer mon compte gratuit <Arrow />
          </Link>
          <Link
            href="/owner/login"
            className="flex items-center justify-center rounded-2xl border-2 border-hair bg-white py-4 text-[15.5px] font-bold text-charcoal active:scale-[0.99]"
          >
            J&apos;ai déjà un compte
          </Link>
        </div>

        {/* reassurance strip */}
        <div className="mt-5 grid grid-cols-3 gap-1 rounded-2xl border border-hair bg-white px-2 py-4 shadow-[0_10px_30px_-22px_rgba(40,18,59,.4)]">
          {trust.map(({ Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 px-1 text-center">
              <Icon className="h-6 w-6 text-royal" />
              <span className="whitespace-pre-line text-[11.5px] font-semibold leading-tight text-charcoal">
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── the loop, 4 steps ───────────────────────────────── */}
      <section className="mx-auto max-w-md px-5 pt-12 pb-6">
        <h2 className="text-[27px] font-extrabold leading-tight text-charcoal">
          4 étapes simples.
        </h2>
        <h2 className="text-[27px] font-extrabold leading-tight text-charcoal">
          Un système qui <span className="text-royal">tourne tout seul.</span>
        </h2>

        <ol className="mt-7 space-y-3">
          {steps.map(({ n, Icon, title, text }, i) => (
            <li key={n}>
              <div className="rounded-3xl border border-hair bg-white p-5 shadow-[0_10px_30px_-24px_rgba(40,18,59,.5)]">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-royal text-[12px] font-bold text-white">
                    {n}
                  </span>
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-lilac text-royal">
                    <Icon />
                  </span>
                </div>
                <p className="mt-3 text-[16px] font-bold text-charcoal">{title}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-slate">{text}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="flex justify-center py-1.5 text-lavender">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 rotate-90" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* ── social proof ────────────────────────────────────── */}
      <section className="mx-auto max-w-md px-5 py-6">
        <div className="rounded-3xl border border-hair bg-cloud px-5 py-6">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-slate">
            Conçu pour des lieux comme
          </p>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-center">
            {["Espace Café", "Le Comptoir", "Urban Grill", "Sweet Corner"].map((n) => (
              <span key={n} className="text-[15px] font-extrabold tracking-tight text-charcoal/70">
                {n}
              </span>
            ))}
            <span className="col-span-2 text-[15px] font-extrabold tracking-[0.15em] text-charcoal/70">
              NERO
            </span>
          </div>
        </div>
      </section>

      {/* ── pricing ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-md px-5 pt-12 pb-4">
        <h2 className="text-[27px] font-extrabold leading-tight text-charcoal">
          Un prix simple.
        </h2>
        <h2 className="text-[27px] font-extrabold leading-tight text-charcoal">
          <span className="text-royal">Tout est compris.</span>
        </h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-slate">
          14 jours d&apos;essai gratuit, sans carte bancaire. Ensuite,
          choisissez votre formule.
        </p>

        <div className="mt-6 space-y-3">
          {/* 6 mois */}
          <div className="rounded-3xl border border-hair bg-white p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-bold text-charcoal">6 mois</span>
              <span className="text-[12.5px] text-slate">≈ 11 TND / mois</span>
            </div>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[34px] font-extrabold leading-none text-charcoal">65</span>
              <span className="text-[14px] font-bold text-slate">TND</span>
            </p>
          </div>

          {/* 1 an — meilleure offre */}
          <div className="relative overflow-hidden rounded-3xl border-2 border-royal bg-lilac/50 p-5">
            <span className="absolute right-4 top-4 rounded-full bg-royal px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.05em] text-white">
              Meilleure offre
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-bold text-charcoal">1 an</span>
            </div>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[34px] font-extrabold leading-none text-charcoal">80</span>
              <span className="text-[14px] font-bold text-slate">TND</span>
              <span className="text-[12.5px] text-slate">≈ 7 TND / mois</span>
            </p>
            <p className="mt-1.5 text-[12.5px] font-semibold text-royal">
              Économisez 50 TND sur l&apos;année.
            </p>
          </div>
        </div>

        <ul className="mt-5 grid gap-2.5">
          {[
            "Programme de points + roue à gagner",
            "Analyses : qui revient, combien vous encaissez",
            "QR + autocollants (ou présentoir) pour vos tables",
            "Sans app à installer — vos clients scannent, c'est tout",
            "Support réactif",
          ].map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-[14px] leading-snug text-charcoal">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mt-[3px] h-[15px] w-[15px] shrink-0 text-royal" aria-hidden><path d="m5 12.5 4.5 4.5L19 7" /></svg>
              {f}
            </li>
          ))}
        </ul>

        <Link
          href="/owner/signup"
          className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-royal py-4 text-[15.5px] font-bold text-white shadow-[0_12px_28px_-10px_rgba(91,63,209,.6)] active:scale-[0.99]"
        >
          Commencer l&apos;essai gratuit <Arrow />
        </Link>
      </section>

      {/* ── final CTA ───────────────────────────────────────── */}
      <section className="mx-auto max-w-md px-5 py-6">
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#6a4de6] to-[#4a2fb0] px-6 py-9 text-white">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div aria-hidden className="pointer-events-none absolute -bottom-14 -left-8 h-44 w-44 rounded-full bg-white/5" />
          <h2 className="relative text-[28px] font-extrabold leading-tight">
            Vos clients reviennent.{" "}
            <span className="text-[#FFCE4D]">Vraiment.</span>
          </h2>
          <p className="relative mt-3 max-w-[34ch] text-[14.5px] leading-relaxed text-white/80">
            Créez votre compte gratuitement et transformez chaque passage en
            fidélité.
          </p>
          <Link
            href="/owner/signup"
            className="relative mt-6 flex items-center justify-center gap-2 rounded-2xl bg-white py-4 text-[15px] font-bold text-royal active:scale-[0.99]"
          >
            Créer mon compte gratuit <Arrow className="h-4 w-4" />
          </Link>
          <div className="relative mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] font-semibold text-white/85">
            <span className="flex items-center gap-1.5"><Check /> Gratuit 14 jours</span>
            <span className="flex items-center gap-1.5"><Check /> Aucune carte bancaire</span>
          </div>
        </div>
      </section>

      {/* ── footer ──────────────────────────────────────────── */}
      <footer className="mx-auto max-w-md px-5 pb-12 pt-6">
        <BrandMark />
        <p className="mt-3 max-w-[42ch] text-[13px] leading-relaxed text-slate">
          Le programme de fidélité nouvelle génération pour les entreprises &amp;
          commerçants.
        </p>
        <div className="mt-4 flex gap-2">
          {["f", "◎", "♪"].map((s, i) => (
            <span key={i} className="grid h-9 w-9 place-items-center rounded-full border border-hair text-[13px] font-bold text-slate">
              {s}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}

function Check({ className = "h-4 w-4" }: I) {
  return (
    <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-white/20">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d="m5 12.5 4.5 4.5L19 7" /></svg>
    </span>
  );
}
