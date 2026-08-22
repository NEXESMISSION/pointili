/**
 * One source of truth for how Pointili describes itself.
 *
 * Two audiences read this site and neither is a person browsing for fun: a shop
 * owner searching for "programme fidélité Tunisie", and increasingly an AI being
 * asked the same question on someone's behalf. Both need the same thing — a
 * clear, factual, machine-readable statement of what this is, what it costs and
 * who it is for.
 *
 * Everything here must stay TRUE. Structured data that overstates gets a site
 * penalised by search engines and, worse, gets a wrong answer repeated by an
 * assistant to someone who then quotes it back at you.
 */

/** The canonical origin. Set NEXT_PUBLIC_SITE_URL to the host that does NOT redirect. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pointili.online").replace(/\/$/, "");

export const SITE_NAME = "Pointili";
export const SITE_DOMAIN = "pointili.online";

/** The one-sentence answer to "what is this". Reused everywhere. */
export const TAGLINE = "La carte de fidélité sans application, pour les commerces tunisiens.";

export const DESCRIPTION =
  "Pointili est un programme de fidélité pour cafés, restaurants et commerces en Tunisie. " +
  "Vos clients scannent un QR code, ouvrent une carte dans leur navigateur — sans application — " +
  "cumulent des points à chaque achat et les échangent contre vos récompenses. " +
  "120 TND par an, 14 jours d'essai gratuit, sans carte bancaire.";

export const PRICES = [
  { name: "Abonnement 1 an", price: 120, months: 12 },
  { name: "Abonnement 6 mois", price: 80, months: 6 },
];

/** Words a Tunisian shop owner actually types. Not a keyword-stuffing list. */
export const KEYWORDS = [
  "programme fidélité Tunisie",
  "carte fidélité digitale",
  "carte de fidélité sans application",
  "fidélité café Tunisie",
  "QR code fidélité",
  "points fidélité commerce",
  "logiciel fidélité restaurant Tunisie",
  "carte fidélité QR code Tunisie",
  "Pointili",
];

/**
 * schema.org, as a script tag.
 *
 * Rendered server-side so a crawler that runs no JavaScript still sees it —
 * which is most AI crawlers.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
       
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/** Who we are. Referenced by every other node via @id, so the graph is connected. */
export function organisation() {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    description: TAGLINE,
    areaServed: { "@type": "Country", name: "Tunisie" },
    knowsLanguage: ["fr", "ar"],
  };
}

/** What we sell, and for how much. The offers are the ones on the page. */
export function product() {
  return {
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#software`,
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: DESCRIPTION,
    url: SITE_URL,
    provider: { "@id": `${SITE_URL}/#organization` },
    inLanguage: "fr",
    /* No aggregateRating: we have no reviews. Inventing one is the fastest way
       to get structured data ignored — and it would be a lie in a market where
       the buyer will ask around. */
    offers: PRICES.map((p) => ({
      "@type": "Offer",
      name: p.name,
      price: p.price,
      priceCurrency: "TND",
      availability: "https://schema.org/InStock",
      url: SITE_URL,
    })),
    featureList: [
      "Carte de fidélité digitale sans application",
      "Points calculés automatiquement à la caisse",
      "Récompenses personnalisables",
      "Cartes à tampons",
      "Analyses : taux de retour, chiffre passé en caisse",
      "QR et lien de boutique, à afficher ou à partager",
      "Un seul code client valable dans tous les commerces Pointili",
    ],
  };
}

/**
 * schema.org type for a shop, from its Pointili business type.
 * A café marked CafeOrCoffeeShop reads far better in a local result than a
 * generic LocalBusiness.
 */
export function localBusinessType(key: string): string {
  const map: Record<string, string> = {
    cafe: "CafeOrCoffeeShop",
    salon_the: "CafeOrCoffeeShop",
    restaurant: "Restaurant",
    fast_food: "FastFoodRestaurant",
    pizzeria: "Restaurant",
    patisserie: "Bakery",
    boulangerie: "Bakery",
    glacier: "IceCreamShop",
    barbier: "HairSalon",
    coiffure: "HairSalon",
    beaute: "BeautySalon",
    pharmacie: "Pharmacy",
    fleuriste: "Florist",
    librairie: "BookStore",
    sport: "SportsActivityLocation",
    epicerie: "GroceryStore",
    superette: "GroceryStore",
  };
  return map[key] ?? "LocalBusiness";
}
