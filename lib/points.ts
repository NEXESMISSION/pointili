/**
 * How a points figure is written, everywhere.
 *
 * Points are decimal since migration 0027 — 1,25 DT earns 1,25 points — which
 * means every screen that used to print an integer can now be handed 184.5, or
 * 0.7500000000000001 if anything ever touches a float. Two rules, one place:
 *
 *   · a whole number stays whole   → "184", never "184,00"
 *   · a fraction shows what it is  → "184,5" and "1,25", French comma
 *
 * Trailing zeros are trimmed because "2,50 points" reads like money and these
 * are not money; and the comma is not decoration — the entire UI is French, and
 * "1.25" is a thousands separator to the person holding the card.
 */
export function fmtPoints(n: number): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "")).replace(".", ",");
}

/** "1,25 point" / "2,5 points" — French agrees the noun with the value. */
export function pointsLabel(n: number): string {
  return `${fmtPoints(n)} point${Math.abs(Number(n) || 0) >= 2 ? "s" : ""}`;
}

/**
 * "12,5" / "60" — a DINAR figure, read aloud, in French.
 *
 * The same two rules as fmtPoints and for the same reason: the whole interface
 * is French, so "12.5" is a thousands separator to the person holding the card,
 * and a trailing zero on "2,50" reads as a price tag on something that is not
 * one. It lives beside the points so the till and the receipt cannot drift
 * apart — the receipt had its own private copy, which is how two spellings of
 * the same number start.
 */
export function fmtDinars(n: number): string {
  return (Math.round((Number(n) || 0) * 100) / 100).toString().replace(".", ",");
}
