import { BRAND_COLOR } from "./brand";

/**
 * THE SHOP'S OWN COLOUR, MADE SAFE.
 *
 * The client app is white now, with one coloured surface: the banner at the top
 * of the card, which belongs to the shop. That means an owner can hand us any
 * hex — including a pale yellow that makes white text vanish, or a pastel that
 * disappears against the page — and the customer's screen still has to be
 * readable. So nothing here trusts the input:
 *
 *   --cafe        the colour as given (banner, fills)
 *   --cafe-ink    what to WRITE on that colour — white or near-black, whichever
 *                 the colour can actually carry
 *   --cafe-text   the colour darkened until it is legible ON WHITE, for the
 *                 balance figure, links, active tabs
 *   --cafe-soft   a wash of it for chips and tints
 *   --cafe-line   a hairline of it
 *   --cafe-deep   a darker end for the banner's gradient
 *
 * The two computed ones (-ink, -text) cannot be done in CSS: color-mix can
 * blend, but it cannot MEASURE, and the whole point is deciding based on the
 * measurement. They are computed on the server and shipped as inline custom
 * properties, so there is no flash and no client-side work.
 */

const INK = "#17121f";
const WHITE = "#ffffff";

/** #abc / #aabbcc → [r,g,b]; anything else → null. */
function parseHex(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function mix(c: [number, number, number], towards: [number, number, number], amount: number) {
  return c.map((v, i) => v + (towards[i] - v) * amount) as [number, number, number];
}

/** A valid brand colour, or the house purple. Never throws, never returns junk. */
export function safeColor(input: string | null | undefined): string {
  const rgb = parseHex(input ?? "");
  return rgb ? toHex(rgb) : BRAND_COLOR;
}

/** White or near-black — whichever is legible ON this colour. */
export function inkOn(color: string): string {
  const rgb = parseHex(color) ?? parseHex(BRAND_COLOR)!;
  return contrast(rgb, parseHex(WHITE)!) >= contrast(rgb, parseHex(INK)!) ? WHITE : INK;
}

/**
 * The same hue, darkened until it clears 4.5:1 on white.
 *
 * A shop whose brand is #ffd400 still gets a yellow-brown that reads as theirs
 * on a white card, rather than a figure nobody over forty can see. Shops with an
 * already-dark brand are returned untouched — the loop simply never runs.
 */
export function textOnWhite(color: string, against: string = WHITE): string {
  let rgb = parseHex(color) ?? parseHex(BRAND_COLOR)!;
  const bg = parseHex(against) ?? parseHex(WHITE)!;
  const black: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 24 && contrast(rgb, bg) < 4.5; i++) rgb = mix(rgb, black, 0.06);
  return toHex(rgb);
}

/** Every custom property the client app themes on, as an inline style object. */
export function cafeVars(primary: string | null | undefined): Record<string, string> {
  const cafe = safeColor(primary);
  const rgb = parseHex(cafe)!;
  const white = parseHex(WHITE)!;

  /*
    THE TINT IS THE HARDER BACKGROUND, SO IT IS THE ONE WE MEASURE AGAINST.

    --cafe-text was computed to clear 4.5:1 on WHITE, and then used on --cafe-soft
    — a tint of the same hue. Same-hue-on-same-hue is the worst case there is:
    the tint lifts the background AND shares the text's chroma, so a figure that
    measured 4.6 on white measured about 4.0 where it was actually drawn. Every
    "purple on lavender" on the card — the errand card's title, the reward
    prices, the icons in their tiles — was sitting just under the line. Nothing
    looked broken; everything looked slightly washed, which is exactly the
    complaint.

    Measuring against the tint fixes all of them at once, and costs a shade of
    darkness on white, where there was margin to spare.

    The tint itself is a step stronger too (86% white, was 90%): at 90% a filled
    icon tile was barely distinguishable from the card it sat on, so the tiles
    read as floating glyphs rather than as objects.
  */
  const soft = toHex(mix(rgb, white, 0.86));

  return {
    "--cafe": cafe,
    "--cafe-ink": inkOn(cafe),
    "--cafe-text": textOnWhite(cafe, soft),
    "--cafe-soft": soft,
    "--cafe-line": toHex(mix(rgb, white, 0.72)),
    "--cafe-deep": toHex(mix(rgb, [0, 0, 0], 0.28)),
  };
}

/**
 * The swatches an owner picks from with one tap.
 *
 * Chosen to be distinguishable at a glance and dark enough to carry white text,
 * because that is the case a shop will hit first. The free picker below them
 * exists for a brand with an exact hex; everything above keeps THAT readable.
 */
export const BRAND_SWATCHES = [
  { name: "Mauve", hex: "#5b3fd1" },
  { name: "Encre", hex: "#1f2937" },
  { name: "Forêt", hex: "#0f6b4f" },
  { name: "Océan", hex: "#0e6fa8" },
  { name: "Brique", hex: "#b0341f" },
  { name: "Terre", hex: "#7a4a25" },
  { name: "Prune", hex: "#7a2b56" },
  { name: "Olive", hex: "#4d6027" },
] as const;
