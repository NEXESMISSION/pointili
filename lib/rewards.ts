/**
 * Rewards, priced the way a shop owner actually thinks.
 *
 * ── THE PROBLEM THIS EXISTS TO FIX ────────────────────────────────────────
 * Every screen that has ever asked an owner to create a reward has asked for a
 * number of POINTS. Réglages asked for it in a bare numeric field; the
 * onboarding screen asked for it eight times, in a grid, before the shop had
 * served a single customer.
 *
 * Nobody knows that number. A café owner knows "a free espresso after about
 * five visits" — that is the whole decision, and it is the one that determines
 * whether the programme works at all. Points are the unit the DATABASE needs.
 * Asking the owner for them is making the person do the machine's arithmetic,
 * and getting it wrong is silent and expensive: this repo's own demo shop
 * shipped with a 200-point espresso against a 1 pt/DT rate — 200 dinars of
 * coffee, about eighty visits, for one free cup. It looked like a filled-in
 * form. It was a loyalty programme nobody could ever finish.
 *
 * So the owner states VISITS, and this converts. points_cost is untouched in
 * the database and every server action still receives points; the unit change
 * is in the question, which is where it belongs.
 *
 * ── WHY THE CONVERSION IS HONEST ──────────────────────────────────────────
 * One dinar is one point, in every shop on the platform, and the database has a
 * CHECK saying so (migration 0031_a). So `points === dinars of spend`, exactly,
 * with no rate to carry around.
 *
 * That leaves one unknown: what a visit is worth. Rather than assume, this uses
 * the shop's OWN average ticket when it has served enough people to have one —
 * so "5 visites" means five visits at THIS counter, not at an imaginary café.
 * A brand-new shop has no history, and only then does it fall back to the
 * yardstick the rest of the product already quotes.
 */

/** A typical Tunisian café ticket — the yardstick, used only until a shop has its own. */
export const DEFAULT_TICKET = 2.5;

/**
 * Below this many recorded sales an average is noise — two large tables would
 * set the price of every reward in the shop. Same instinct as stats' MIN_SAMPLE.
 */
export const MIN_TICKET_SAMPLE = 5;

/** What one visit is worth here, in dinars (= in points). */
export type Ticket = {
  tnd: number;
  /** false → the platform yardstick, because this shop has no history yet. */
  measured: boolean;
};

export const DEFAULT_TICKET_INFO: Ticket = { tnd: DEFAULT_TICKET, measured: false };

/** Visits → the points to store. At least 1: a free reward is not a reward. */
export function pointsForVisits(visits: number, ticket: Ticket): number {
  return Math.max(1, Math.round(visits * ticket.tnd));
}

/** Points → the visits to show. At least 1, for the same reason. */
export function visitsForPoints(points: number, ticket: Ticket): number {
  return Math.max(1, Math.round(points / ticket.tnd));
}

/**
 * The ladder offered in the editor.
 *
 * Not a free-text number, because the interesting range is narrow and the
 * dangerous end of it is unmarked: an owner typing "20" has no way to know they
 * have just built something nobody reaches. Presets put the good answer within
 * one tap and make the bad one a deliberate act (there is still an "autre"
 * field for a shop that genuinely needs 30).
 */
export const VISIT_PRESETS = [2, 3, 5, 8, 12] as const;

/**
 * Is the FIRST reward reachable?
 *
 * The cheapest one is the only one most customers ever look at: it is what
 * decides whether the card feels winnable in week one or like a loyalty card
 * from a supermarket. Everything above it can be as aspirational as the owner
 * likes.
 *
 * Six is the line because the advice this product already gives, everywhere it
 * gives it, is "atteignable en 2–3 visites" — six leaves room to disagree
 * without leaving room to ship an eighty-visit espresso.
 */
export const EASY_FIRST_VISITS = 6;

/** Reward-name suggestions per business type — a tap instead of a blank field. */
const IDEAS: Record<string, string[]> = {
  cafe: ["Café offert", "Thé à la menthe", "Croissant offert"],
  salon_the: ["Thé à la menthe", "Pâtisserie offerte", "Café offert"],
  restaurant: ["Dessert offert", "Entrée offerte", "Café offert"],
  fastfood: ["Menu offert", "Frites offertes", "Boisson offerte"],
  pizzeria: ["Pizza offerte", "Boisson offerte", "Dessert offert"],
  patisserie: ["Pâtisserie du jour", "Part de gâteau", "Café offert"],
  boulangerie: ["Baguette offerte", "Viennoiserie offerte", "Croissant offert"],
  glacier: ["Boule offerte", "Coupe de glace offerte", "Topping offert"],
  juice: ["Jus offert", "Smoothie offert", "Supplément offert"],
  bar: ["Boisson offerte", "Planche offerte", "Cocktail offert"],
  coiffure: ["Brushing offert", "Soin offert", "-20% sur la coupe"],
  /*
    "Coupe de cheveux", not "Coupe" — and the glacier above says "Coupe de
    glace" for the same reason.

    The bare word was suggested to BOTH trades and means two unrelated things:
    a haircut here, a sundae there. In French an owner reading a list of
    suggestions can usually infer which; in Tunisian there is no shared word,
    so the dictionary had to either guess — and tell an ice-cream shop's
    customer they had won قصّة هدية, a free haircut — or leave the reward in
    French on an otherwise Arabic card.

    Naming the thing fixes it at the source instead: both suggestions are now
    unambiguous in either language, and no screen has to know what kind of shop
    it is drawing. No shop had saved the old wording (checked), so nothing
    needs migrating.
  */
  barbier: ["Taille de barbe offerte", "Coupe de cheveux offerte", "Soin offert"],
  beaute: ["Soin offert", "Échantillon offert", "-20% sur un produit"],
  sport: ["Séance offerte", "Boisson offerte", "1 mois -20%"],
  mode: ["-20% sur un article", "Accessoire offert", "Retouche offerte"],
  librairie: ["Livre de poche offert", "-20% sur un livre", "Marque-page offert"],
  fleuriste: ["Bouquet offert", "-20% sur un bouquet", "Fleur offerte"],
  epicerie: ["-20% sur le panier", "Produit offert", "Boisson offerte"],
  epicerie_fine: ["Produit offert", "Dégustation offerte", "-20% sur le panier"],
  traiteur: ["Plat offert", "Dessert offert", "-20% sur la commande"],
  boutique: ["-20% sur un article", "Article offert", "Cadeau surprise"],
  pharmacie: ["Produit offert", "-20% sur un produit", "Échantillon offert"],
};

const IDEAS_FALLBACK = ["Un produit offert", "-20% sur la prochaine visite", "Cadeau surprise"];

export function rewardIdeas(businessType: string | null | undefined): string[] {
  return (businessType && IDEAS[businessType]) || IDEAS_FALLBACK;
}
