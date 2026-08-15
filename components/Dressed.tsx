import { DEMO_VERSION } from "./demoVersion";

/**
 * ── LA CARTE EST LA VÔTRE ─────────────────────────────────────────────────
 *
 * The hardest claim on this page to believe, because every other asset on it
 * shows ONE shop: a card that carries your colour, your logo, your photograph.
 * Read once, "personnalisable" is what every SaaS page says and nobody checks.
 *
 * So it is not a claim here, it is three screenshots of the SAME screen wearing
 * three different shops — a blue café with a dot texture, a brown one with a
 * photograph of its own room, a green one flat and square. Same product, same
 * balance, same customer. They are shot by scripts/theme-shots.mjs against the
 * real app, like everything else on this page.
 *
 * Three, not a slider. A slider is a thing to operate; three side by side is a
 * thing you understand without touching anything, and on a phone they scroll.
 */

const LOOKS = [
  {
    file: "theme-a",
    label: "Une couleur",
    note: "La vôtre, avec un motif discret et des angles arrondis.",
  },
  {
    file: "theme-b",
    label: "Une photo",
    note: "Votre salle, votre comptoir. Le nom reste lisible dessus.",
  },
  {
    file: "theme-c",
    label: "Un aplat",
    note: "Net, carré, sans dégradé — si c'est votre style.",
  },
];

export function Dressed() {
  return (
    <section className="border-t border-hair bg-lilac-2">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-royal">
          Votre marque
        </p>
        <h2 className="mt-5 max-w-[20ch] text-[32px] md:text-[44px]">
          La carte porte votre nom. Pas le nôtre.
        </h2>
        <p className="mt-5 max-w-[54ch] text-[15.5px] leading-relaxed text-slate">
          Votre couleur, votre logo, et une photo de votre salle si vous en
          voulez une. Vous choisissez la hauteur du bandeau, l&apos;arrondi des
          angles et le motif — depuis vos Réglages, en trente secondes, sans
          nous écrire.{" "}
          <span className="font-semibold text-charcoal">
            Ci-dessous, le même écran, trois commerces.
          </span>
        </p>

        {/* A row on a laptop; a scroll on a phone, deliberately cut off at the
            edge so it reads as more-than-fits rather than as all there is. */}
        <ul className="-mx-5 mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
          {LOOKS.map((l) => (
            <li key={l.file} className="w-[268px] shrink-0 snap-start md:w-auto">
              <div className="overflow-hidden rounded-[3px] border border-hair bg-white shadow-[0_18px_40px_-28px_rgba(26,19,48,0.5)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- a static asset, not user content */}
                <img
                  src={`/demo/${l.file}.png?v=${DEMO_VERSION}`}
                  alt={`La carte client — ${l.label.toLowerCase()}`}
                  width={390}
                  height={780}
                  loading="lazy"
                  className="block h-auto w-full"
                />
              </div>
              <p className="mt-4 text-[15px] font-bold text-charcoal">{l.label}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-slate">{l.note}</p>
            </li>
          ))}
        </ul>

        {/*
          The language, said here rather than in a feature list.

          It belongs with "the card is yours" because it is the same promise
          from the customer's side, and because it is the one line on this page
          a Tunisian owner reads and thinks "they built this for here" — the
          second language is DERJA, not fusha. Written in both scripts, because
          a person who wants it is not reading the French word for it.
        */}
        <div className="mt-12 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-t border-hair pt-8">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-royal">
            Et la langue
          </p>
          <p className="max-w-[52ch] text-[15px] leading-relaxed text-slate">
            Vos clients lisent leur carte en{" "}
            <span className="font-semibold text-charcoal">français</span> ou en{" "}
            <span className="font-semibold text-charcoal">tunisien</span> —{" "}
            <span className="font-semibold text-charcoal" lang="ar-TN" dir="rtl">
              بالتونسي
            </span>
            , pas en arabe littéraire. Chacun choisit, sur son téléphone.
          </p>
        </div>
      </div>
    </section>
  );
}
