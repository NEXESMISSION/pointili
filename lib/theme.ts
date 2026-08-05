import { BRAND_COLOR } from "./brand";
import type { CardTheme } from "./types";

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
  /*
    TOWARDS BLACK OR TOWARDS WHITE — whichever the background asks for.

    This only ever darkened, which is right on a white card and exactly wrong on
    a dark one: a shop that chose the dark app got its own colour pushed further
    into the background it was supposed to stand out from, and the balance
    figure disappeared. The direction is decided by the background's own
    luminance, once, before the loop.
  */
  const towards: [number, number, number] = luminance(bg) > 0.45 ? [0, 0, 0] : [255, 255, 255];
  for (let i = 0; i < 24 && contrast(rgb, bg) < 4.5; i++) rgb = mix(rgb, towards, 0.06);
  return toHex(rgb);
}

/** Corner roundness, in the three sizes the owner can choose between. */
const RADIUS: Record<CardTheme["radius"], string> = { s: "10px", m: "22px", l: "30px" };

/**
 * Everything the customer's app needs to wear a shop's theme.
 *
 * One object, computed once per request in the layout: the colour tokens above,
 * plus the roundness and the typeface. The surface (light/dark) is NOT here —
 * it is a class, because it switches whole rules rather than one value.
 */
export function themeVars(
  primary: string | null | undefined,
  theme: Pick<CardTheme, "radius" | "font" | "surface">,
): Record<string, string> {
  return {
    /* The tint and the accent are measured against the surface they will be
       DRAWN on — white cards or dark ones. Passing the panel colour here is
       what makes the dark theme legible rather than merely dark. */
    ...cafeVars(primary, theme.surface === "dark" ? DARK_PANEL : WHITE),
    "--card-radius": RADIUS[theme.radius] ?? RADIUS.m,
    /*
      Both faces are already loaded by the root layout for every page in the
      product, so switching between them costs nothing — no extra request, no
      FOUT. That is the entire reason the choice is two and not ten.
    */
    "--card-font":
      theme.font === "poppins"
        ? "var(--font-poppins-var), var(--font-inter), sans-serif"
        : "var(--font-inter), system-ui, sans-serif",
  };
}

/** The dark theme's card colour — kept in step with .surface-dark's --panel. */
const DARK_PANEL = "#17141f";

/**
 * Every custom property the client app themes on, as an inline style object.
 *
 * `panel` is the surface these tokens will sit on: white on the light theme,
 * the dark card on the dark one. It is not decoration — --cafe-soft is a blend
 * TOWARDS it and --cafe-text is measured AGAINST it, so getting it wrong is how
 * you end up with a bright lavender chip glowing on a black page.
 */
export function cafeVars(
  primary: string | null | undefined,
  panel: string = WHITE,
): Record<string, string> {
  const cafe = safeColor(primary);
  const rgb = parseHex(cafe)!;
  const white = parseHex(panel) ?? parseHex(WHITE)!;

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
  { name: "Turquoise", hex: "#0e7c86" },
  { name: "Ardoise", hex: "#475569" },
  { name: "Olive", hex: "#4d6027" },
] as const;
