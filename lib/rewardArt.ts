/**
 * A PICTURE FOR EVERY REWARD, WITHOUT ASKING THE OWNER FOR ONE.
 *
 * loyalty_rewards.image_url has existed all along, and scripts/reward-art.mjs
 * drew a set of flat illustrations for it — but nothing ever connected the two.
 * So a shop that finished onboarding got a ladder of four identical grey gift
 * glyphs on its customers' cards, which is the single thing that makes a real
 * shop's app look like an unfinished template.
 *
 * The owner still uploads a photo whenever they want to; this only fills the
 * gap, and only when the field is empty. Matching is on WORDS, not on an exact
 * label, because "Espresso offert", "1 espresso" and "espresso gratuit" are the
 * same drink and an owner should not have to guess our filename.
 *
 * Drawn, not photographed, on purpose: stock photography of a coffee would be
 * someone else's espresso, someone else's licence, and 200 KB on a phone on 3G.
 * These are ~4 KB PNGs served from /public.
 */

/** Every keyword that should land on a given file, most specific first. */
const MATCHES: [file: string, words: string[]][] = [
  ["espresso-offert", ["espresso", "expresso", "ristretto", "café noir", "cafe noir"]],
  ["cappuccino-offert", ["cappuccino", "capucino", "latte", "macchiato", "café crème", "cafe creme", "café au lait"]],
  ["the-a-la-menthe", ["thé", "the a la menthe", "menthe", "infusion", "tisane"]],
  ["jus-dorange", ["jus", "orange", "citronnade", "smoothie", "limonade"]],
  ["patisserie-du-jour", ["pâtisserie", "patisserie", "gâteau", "gateau", "dessert", "tarte", "cheesecake"]],
  ["croissant-offert", ["croissant", "viennoiserie", "pain au chocolat", "brioche"]],
  ["sandwich-offert", ["sandwich", "burger", "panini", "wrap", "baguette garnie"]],
  ["brunch-complet", ["brunch", "petit-déjeuner", "petit dejeuner", "formule", "menu complet"]],
];

/**
 * The illustration for this reward, or null when nothing fits.
 *
 * Null is a real answer: a barber's "coupe offerte" has no drawing in the set,
 * and inventing one by falling back to a croissant would be worse than the gift
 * icon the card already draws in the shop's own colour.
 */
export function rewardArtFor(label: string): string | null {
  /* Accents stripped and lowercased on BOTH sides, so "Pâtisserie" typed
     without its circumflex still matches. */
  const hay = normalise(label);
  if (!hay) return null;

  for (const [file, words] of MATCHES) {
    if (words.some((w) => hay.includes(normalise(w)))) return `/rewards/${file}.png`;
  }
  return null;
}

function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
