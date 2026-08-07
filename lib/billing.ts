/**
 * WHAT A SHOP PAYS, AND WHERE THEY PAY IT.
 *
 * One file, because these numbers were scattered across the settings screen as
 * hard-coded JSX and the renewal flow needs the same two prices, the same two
 * durations and the same three ways to pay — and an offer that says 80 TND on
 * one screen and 80 DT for 10 months on the next is worse than no offer.
 */

export type OfferId = "6m" | "12m";

export type Offer = {
  id: OfferId;
  label: string;
  months: number;
  /** Total, in TND. The only number an owner is asked to transfer. */
  price: number;
  /** The comparison line — decided here, never in a template. */
  perMonth: string;
  best?: true;
};

export const OFFERS: Offer[] = [
  { id: "6m", label: "6 mois", months: 6, price: 65, perMonth: "≈ 11 TND / mois" },
  { id: "12m", label: "1 an", months: 12, price: 80, perMonth: "≈ 7 TND / mois", best: true },
];

export function offer(id: string): Offer | null {
  return OFFERS.find((o) => o.id === id) ?? null;
}

/* ── how they pay ───────────────────────────────────────────────────────── */

export type MethodId = "d17" | "flouci" | "rib";

export type Method = {
  id: MethodId;
  label: string;
  /** What to do, in the owner's words. */
  how: string;
  /** The destination: a phone, a link, an account number. */
  lines: { label: string; value: string }[];
};

/**
 * ── THESE COORDINATES ARE NOT REAL ────────────────────────────────────────
 *
 * They are shaped like the real thing so the screen can be designed, laid out
 * and tested, and they are deliberately impossible to mistake for an account
 * anyone could pay into: every digit is a zero, the RIB fails its own checksum,
 * and the Flouci link points at example.com.
 *
 * While this flag is true the flow SAYS SO, loudly, on the screen and next to
 * every value — see PaymentDetails in the renewal form. Nobody transfers 80 TND
 * to a placeholder because it was quietly styled to look official.
 *
 * To go live: put the real values below and set PLACEHOLDER to false. That is
 * the whole change — the banner, the chips and the warning disappear on their
 * own, and nothing else in the flow knows or cares.
 */
export const PLACEHOLDER = true;

export const METHODS: Method[] = [
  {
    id: "d17",
    label: "D17",
    how: "Ouvrez D17 → Transfert → saisissez le numéro ci-dessous, puis le montant.",
    lines: [
      { label: "Numéro D17", value: "00 000 000" },
      { label: "Au nom de", value: "EXEMPLE — À REMPLACER" },
    ],
  },
  {
    id: "flouci",
    label: "Flouci",
    how: "Ouvrez Flouci → Envoyer de l'argent → au numéro ci-dessous.",
    lines: [
      { label: "Numéro Flouci", value: "00 000 000" },
      { label: "Lien de paiement", value: "exemple.invalid/pointili" },
    ],
  },
  {
    id: "rib",
    label: "Virement (RIB)",
    how: "Virement ou versement au guichet. Gardez le reçu — c'est lui que vous enverrez.",
    lines: [
      { label: "RIB", value: "TN59 0000 0000 0000 0000 00" },
      { label: "Banque", value: "EXEMPLE — À REMPLACER" },
      { label: "Bénéficiaire", value: "EXEMPLE — À REMPLACER" },
    ],
  },
];

export function method(id: string): Method | null {
  return METHODS.find((m) => m.id === id) ?? null;
}

/** "65 TND" — one place, so the space and the unit never wander. */
export function tnd(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(3)} TND`;
}

export const REQUEST_STATUS: Record<string, { label: string; tone: "wait" | "ok" | "no" }> = {
  pending: { label: "En vérification", tone: "wait" },
  approved: { label: "Validée", tone: "ok" },
  rejected: { label: "Refusée", tone: "no" },
};
