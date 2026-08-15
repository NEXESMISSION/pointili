import type { CardTheme } from "./types";

/**
 * ── READY-MADE IDENTITIES ─────────────────────────────────────────────────
 *
 * An owner opening Réglages meets eight controls — colour, banner, corners,
 * height, pattern, surface, radius, font — and every one of them is a decision
 * they did not ask to make. Most shops have a colour in mind and no opinion
 * whatsoever about corner radii, so the honest thing is to make the whole set
 * choosable in one tap and leave the eight knobs for the shop that wants them.
 *
 * These are not "themes" in the sense of a skin we own. Each one is a complete
 * position — a colour AND the shape and texture that suit it — of the kind a
 * designer would hand a café. Tapping one fills in every control; changing
 * anything afterwards is still just changing a control.
 *
 * WHY SIX. Enough that a shop can find itself in one of them (a modern coffee
 * bar, a traditional salon de thé, a patisserie, a fast counter), few enough to
 * be read in one glance. A gallery of thirty is a catalogue to shop from, which
 * is a different and much longer job than opening a loyalty card.
 *
 * NOTHING HERE CAN BREAK LEGIBILITY. Every colour goes through safeColor() and
 * the contrast engine like any other (lib/theme.ts) — a preset is a starting
 * point, not an exemption.
 */
export type Look = {
  id: string;
  /** What an owner would call it, not what a designer would. */
  name: string;
  /** The one line that says who it is for. */
  note: string;
  colour: string;
  theme: Pick<
    CardTheme,
    "banner" | "surface" | "radius" | "bannerRound" | "bannerHeight" | "pattern" | "font"
  >;
};

export const LOOKS: Look[] = [
  {
    id: "bleu-nuit",
    name: "Bleu nuit",
    note: "Moderne, calme. Le café de quartier qui torréfie lui-même.",
    colour: "#1d4ed8",
    theme: {
      banner: "gradient",
      surface: "light",
      radius: "m",
      bannerRound: "l",
      bannerHeight: "l",
      pattern: "dots",
      font: "poppins",
    },
  },
  {
    id: "terracotta",
    name: "Terracotta",
    note: "Chaleureux. Les murs en terre cuite, les tables en bois.",
    colour: "#a4522c",
    theme: {
      banner: "gradient",
      surface: "light",
      radius: "l",
      bannerRound: "m",
      bannerHeight: "m",
      pattern: "none",
      font: "poppins",
    },
  },
  {
    id: "vert-menthe",
    name: "Vert menthe",
    note: "Le salon de thé. Menthe, pignons, plateaux en cuivre.",
    colour: "#0f6b52",
    theme: {
      banner: "flat",
      surface: "light",
      radius: "m",
      bannerRound: "none",
      bannerHeight: "m",
      pattern: "stripes",
      font: "inter",
    },
  },
  {
    id: "sable",
    name: "Sable",
    note: "La pâtisserie : clair, doux, rien qui crie.",
    colour: "#b07d2b",
    theme: {
      banner: "gradient",
      surface: "light",
      radius: "l",
      bannerRound: "l",
      bannerHeight: "s",
      pattern: "grid",
      font: "poppins",
    },
  },
  {
    id: "encre",
    name: "Encre",
    note: "Le comptoir rapide. Noir, net, lisible de loin.",
    colour: "#1f2430",
    theme: {
      banner: "flat",
      surface: "light",
      radius: "s",
      bannerRound: "none",
      bannerHeight: "s",
      pattern: "none",
      font: "inter",
    },
  },
  {
    id: "nuit",
    name: "Nuit",
    note: "Toute l'app en sombre — bar à cocktails, salon de coiffure.",
    colour: "#7c5cff",
    theme: {
      banner: "gradient",
      surface: "dark",
      radius: "l",
      bannerRound: "l",
      bannerHeight: "l",
      pattern: "dots",
      font: "poppins",
    },
  },
];
