"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GiftIcon } from "./icons";

/**
 * The moment a customer can actually have something.
 *
 * Everything else in this product is a promise — points accumulate, a bar
 * fills, a card says "encore 17". This is the one screen where the promise is
 * kept, and until now nothing marked it: the diner opened their card and the
 * number was simply bigger, with the reward sitting in a list one tap away that
 * they had no reason to open. The person who paid for those coffees found out
 * they had earned something only if they went looking.
 *
 * So it takes the whole screen, once, and names the thing: not "vous avez 201
 * points" but "tu as gagné un café offert".
 *
 * WHAT IT DELIBERATELY IS NOT
 *   - it does not repeat. It fires on rewards that crossed the threshold SINCE
 *     the last time this card was opened, and opening the card is what moves
 *     that mark — so a refresh, a back button or a second visit is silent.
 *     (balanceSinceLastOpen in lib/db.ts, read before touchCardOpened.)
 *   - it does not block. The card is already rendered underneath and this is an
 *     overlay on a finished screen; the veil, Escape and the × all dismiss it,
 *     and the button is a real link rather than a state machine.
 *   - it is not a library. Sixteen spans and four keyframes; a confetti package
 *     would weigh more than the page it is congratulating, on a phone on 3G at
 *     a café table.
 *   - it does not throw anything at someone who asked for no motion. With the
 *     preference set the same panel appears, says the same words, and waits.
 */

/*
  Fixed placements, not random. Math.random() in a render is a hydration
  mismatch, and — more to the point — a celebration that lands somewhere new on
  every visit reads as a rendering fault rather than a flourish. Sixteen pieces
  ringed around the medallion: left %, top %, colour, delay, size, and whether
  it is a square or a bar.
*/
const BITS: [number, number, string, number, number][] = [
  [8, 14, "#ffd27a", 0, 11], [21, 7, "#c9b8ff", 120, 9], [34, 17, "#ffd27a", 60, 8],
  [47, 5, "#ffffff", 200, 9], [61, 15, "#c9b8ff", 90, 11], [75, 8, "#ffd27a", 160, 9],
  [89, 16, "#ffffff", 40, 8], [5, 27, "#c9b8ff", 240, 9], [94, 29, "#ffd27a", 110, 10],
  [12, 40, "#ffffff", 180, 8], [88, 42, "#c9b8ff", 70, 9], [4, 49, "#ffd27a", 140, 11],
  [96, 51, "#ffffff", 20, 8], [17, 53, "#c9b8ff", 220, 9], [83, 55, "#ffd27a", 100, 10],
  [30, 59, "#ffffff", 260, 8],
];

export function RewardUnlocked({
  label,
  imageUrl,
  href,
}: {
  /** The reward that just came into reach, named the way the shop named it. */
  label: string;
  imageUrl: string | null;
  /** Where "Voir mes récompenses" goes — the shop's own boutique. */
  href: string;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Récompense débloquée : ${label}`}
      onClick={() => setOpen(false)}
      className="unlock-veil fixed inset-0 z-[60] flex flex-col items-center justify-center px-6 text-center text-white"
      /*
        The café's own colour, deepened — this is their moment, not Pointili's.

        DEEPENED HARD, and that is the whole trick: every word and every ray on
        this screen is white, so the veil has to stay dark for ANY brand colour
        an owner picks. The centre used to be the hue mixed with WHITE, which is
        fine for a deep purple and illegible for a shop whose colour is yellow.
        Mixing toward black instead keeps the hue and keeps the contrast.
      */
      style={{
        background:
          "radial-gradient(120% 70% at 50% 38%, color-mix(in oklab, var(--cafe, #5b3fd1), #000 25%) 0%, color-mix(in oklab, var(--cafe, #5b3fd1), #05010a 62%) 55%, #0b0616 100%)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Fermer"
        className="absolute right-5 top-[max(1.25rem,env(safe-area-inset-top))] grid h-10 w-10 place-items-center rounded-full bg-white/12 text-white/70 transition active:scale-95"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-4 w-4">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      {/*
        Across the whole screen, above the rays.

        It lived inside the medallion's own box first, which put sixteen small
        pale squares directly on top of a bright sunburst — invisible in every
        frame. Confetti has to be thrown somewhere the eye is not already busy.
      */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[62%]">
        {BITS.map(([left, top, colour, delay, size], i) => (
          <span
            key={i}
            className="unlock-bit absolute block rounded-[2px]"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size + (i % 3 === 0 ? 5 : 0),
              background: colour,
              animationDelay: `${delay}ms`,
            }}
          />
        ))}
      </span>

      <p className="unlock-line relative z-20 text-[15.5px] font-extrabold tracking-[0.01em]">
        Récompense débloquée !
      </p>

      {/* the medallion: rays behind, the thing itself in front */}
      <div className="relative z-20 mt-9 grid h-[248px] w-[248px] place-items-center">
        <span
          aria-hidden
          className="unlock-rays absolute inset-[-14%] rounded-full"
          style={{
            /*
              repeating-, not plain. A conic-gradient whose stops stop at 24deg
              paints the remaining 336 degrees with its last colour, so this
              drew exactly ONE grey wedge instead of a ring of rays.
            */
            background:
              "repeating-conic-gradient(from 0deg, rgba(255,255,255,.34) 0 5deg, transparent 5deg 22deg)",
            maskImage: "radial-gradient(closest-side, transparent 46%, #000 54%, #000 92%, transparent)",
            WebkitMaskImage: "radial-gradient(closest-side, transparent 46%, #000 54%, #000 92%, transparent)",
          }}
        />
        <span
          aria-hidden
          className="unlock-glow absolute inset-[6%] rounded-full"
          style={{ background: "radial-gradient(closest-side, rgba(255,255,255,.55), transparent 70%)" }}
        />

        <span className="unlock-medal relative grid h-[186px] w-[186px] place-items-center overflow-hidden rounded-full bg-white shadow-[0_18px_50px_-12px_rgba(0,0,0,.55)]">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- an owner-uploaded URL, not a build-time asset
            <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-contain p-6" />
          ) : (
            /* the colour goes on a wrapper — the icons draw in currentColor and
               take no style prop */
            <span style={{ color: "var(--cafe-text)" }}>
              <GiftIcon className="h-20 w-20" />
            </span>
          )}
        </span>
      </div>

      <h1 className="unlock-line mt-9 text-[26px] font-extrabold leading-none [animation-delay:.24s]">
        Félicitations !
      </h1>
      <p className="unlock-line mt-2.5 text-[13.5px] leading-snug text-white/75 [animation-delay:.32s]">
        Tu as gagné
      </p>
      {/* the shop's own wording, on its own line — "Brunch complet" is a title,
          not a noun that can be dropped into the middle of a sentence */}
      <p className="unlock-line mt-1 text-[19px] font-extrabold leading-tight [animation-delay:.36s]">
        {label}
      </p>

      <Link
        href={href}
        onClick={(e) => e.stopPropagation()}
        className="unlock-line mt-11 w-full max-w-[330px] rounded-full bg-white py-4 text-[14.5px] font-extrabold text-[#1a1030] shadow-[0_16px_40px_-14px_rgba(0,0,0,.7)] transition active:scale-[0.98] [animation-delay:.4s]"
      >
        Voir mes récompenses
      </Link>

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="unlock-line mt-4 text-[13px] font-semibold text-white/55 [animation-delay:.46s]"
      >
        Plus tard
      </button>
    </div>
  );
}
