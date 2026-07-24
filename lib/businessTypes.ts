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

const BY_KEY = new Map(BUSINESS_TYPES.map((t) => [t.key, t]));
const FALLBACK: BusinessType = { key: "other", label: "Boutique", emoji: "✨" };

/** Resolve a stored key to its label + emoji, tolerant of unknown/empty values. */
export function businessType(key: string | null | undefined): BusinessType {
  return (key && BY_KEY.get(key)) || FALLBACK;
}
