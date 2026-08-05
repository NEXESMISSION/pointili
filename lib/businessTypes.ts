/**
 * Business categories — set by the owner, shown to the diner so they can tell a
 * coffee card from a bakery card at a glance. The stored value is the `key`.
 *
 * Emoji, not icon components, on purpose: it's one field, it renders everywhere
 * (owner picker, diner card, wallet box) with zero markup, and it reads instantly.
 */
export type BusinessType = { key: string; label: string; emoji: string };

export const BUSINESS_TYPES: BusinessType[] = [
  { key: "cafe", label: "Café", emoji: "☕" },
  { key: "restaurant", label: "Restaurant", emoji: "🍽️" },
  { key: "fastfood", label: "Fast-food", emoji: "🍔" },
  { key: "patisserie", label: "Pâtisserie", emoji: "🧁" },
  { key: "boulangerie", label: "Boulangerie", emoji: "🥖" },
  { key: "salon_the", label: "Salon de thé", emoji: "🫖" },
  { key: "bar", label: "Bar", emoji: "🍸" },
  { key: "glacier", label: "Glacier", emoji: "🍦" },
  { key: "juice", label: "Jus & smoothies", emoji: "🥤" },
  { key: "pizzeria", label: "Pizzeria", emoji: "🍕" },
  { key: "epicerie", label: "Épicerie", emoji: "🛒" },
  { key: "boutique", label: "Boutique", emoji: "🛍️" },
  { key: "mode", label: "Mode & vêtements", emoji: "👗" },
  { key: "beaute", label: "Beauté & cosmétiques", emoji: "💄" },
  { key: "coiffure", label: "Coiffure", emoji: "💇" },
  { key: "barbier", label: "Barbier", emoji: "💈" },
  { key: "sport", label: "Salle de sport", emoji: "🏋️" },
  { key: "librairie", label: "Librairie", emoji: "📚" },
  { key: "fleuriste", label: "Fleuriste", emoji: "💐" },
  { key: "pharmacie", label: "Pharmacie", emoji: "💊" },
  { key: "epicerie_fine", label: "Épicerie fine", emoji: "🧀" },
  { key: "traiteur", label: "Traiteur", emoji: "🥘" },
  { key: "other", label: "Autre", emoji: "✨" },
];

/**
 * THE SHOP'S NAME USUALLY SAYS WHAT IT IS.
 *
 * "Boulangerie Nour" was being created as a Café, because the picker defaults
 * to café and a new owner has no reason to think the default is wrong — the
 * word is right there in the name they just typed. It surfaced later as a card
 * reading "Boulangerie Nour · Café" to their customers, and as a settings row
 * nobody goes looking for.
 *
 * Keywords rather than fuzzy matching: a shop is called what it is called, and
 * a guess that is nearly right ("Pâtisserie" landing on Boulangerie) is worse
 * than no guess. Whole words only, so "Barbierre" does not become a barber and
 * "Café de la Poste" does not become a pharmacy for containing "post".
 *
 * Returns null when nothing matches, which is most names — the caller keeps its
 * own default and the owner still chooses.
 */
const NAME_HINTS: [key: string, words: string[]][] = [
  ["boulangerie", ["boulangerie", "boulanger", "khobz"]],
  ["patisserie", ["patisserie", "patissier", "gateaux", "gateau"]],
  ["pizzeria", ["pizzeria", "pizza"]],
  ["glacier", ["glacier", "glaces", "gelato", "ice"]],
  ["juice", ["jus", "smoothie", "smoothies", "juice"]],
  ["salon_the", ["salon de the", "tea room", "theiere"]],
  ["barbier", ["barbier", "barber", "barbershop"]],
  ["coiffure", ["coiffure", "coiffeur", "coiffeuse", "hair"]],
  ["beaute", ["beaute", "institut", "spa", "cosmetique", "cosmetiques"]],
  ["pharmacie", ["pharmacie", "parapharmacie"]],
  ["librairie", ["librairie", "libraire", "bookshop"]],
  ["fleuriste", ["fleuriste", "fleurs", "florist"]],
  ["sport", ["gym", "fitness", "musculation", "sport"]],
  ["restaurant", ["restaurant", "resto", "brasserie"]],
  ["fastfood", ["fast food", "fastfood", "burger", "tacos", "sandwicherie"]],
  ["traiteur", ["traiteur"]],
  ["epicerie_fine", ["epicerie fine", "fromagerie", "cave"]],
  ["epicerie", ["epicerie", "superette", "supermarche", "alimentation"]],
  ["mode", ["mode", "boutique de vetements", "vetements", "pret a porter"]],
  ["bar", ["bar", "pub", "lounge"]],
  ["cafe", ["cafe", "coffee", "kahwa", "espresso"]],
];

export function guessBusinessType(name: string): string | null {
  const hay = ` ${name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
  if (hay.length < 3) return null;

  for (const [key, words] of NAME_HINTS) {
    if (words.some((w) => hay.includes(` ${w} `))) return key;
  }
  return null;
}

const BY_KEY = new Map(BUSINESS_TYPES.map((t) => [t.key, t]));
const FALLBACK: BusinessType = { key: "other", label: "Boutique", emoji: "✨" };

/** Resolve a stored key to its label + emoji, tolerant of unknown/empty values. */
export function businessType(key: string | null | undefined): BusinessType {
  return (key && BY_KEY.get(key)) || FALLBACK;
}
