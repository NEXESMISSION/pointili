/**
 * The one brand colour for every diner card.
 *
 * Owners used to recolour their card, which made the app look inconsistent (a
 * fixed nav against an arbitrary card colour, mismatched tiles in the wallet).
 * We keep a single deep-purple brand everywhere; shops are told apart by their
 * logo and business-type emoji, not by colour.
 */
export const BRAND_COLOR = "#5b3fd1";

/**
 * The diner shell's background — one definition for every dark screen.
 *
 * It was duplicated (with drifting values) in the café layout and the wallet.
 * A deep, high-contrast fall: a focused brand glow at the very top, dropping to
 * near-black at the bottom so the frosted panels and white text pop.
 */
export const DINER_BG = {
  backgroundColor: "#07030f",
  backgroundImage: [
    `radial-gradient(95% 42% at 50% -4%, color-mix(in oklab, ${BRAND_COLOR}, #fff 6%) 0%, transparent 58%)`,
    `linear-gradient(180deg,` +
      ` color-mix(in oklab, ${BRAND_COLOR}, #000 40%) 0%,` +
      ` color-mix(in oklab, ${BRAND_COLOR}, #000 68%) 42%,` +
      ` color-mix(in oklab, ${BRAND_COLOR}, #000 86%) 72%,` +
      ` #07030f 100%)`,
  ].join(", "),
  backgroundAttachment: "fixed",
} as const;
