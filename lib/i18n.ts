import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, translator, type Lang } from "./dict";

export { LANG_COOKIE, dir, translator, type Lang, type T } from "./dict";

/**
 * Which language this person reads — the cookie, or TUNISIAN.
 *
 * A preference of the PERSON, not of the shop and not of the URL: the address
 * on the sticker stuck to the table must mean the same thing for everybody who
 * scans it. See lib/dict for why the second language is Tunisian and not fusha.
 *
 * ── WHY TUNISIAN IS THE DEFAULT AND FRENCH IS THE CHOICE ──────────────────
 *
 * This was the other way round, which had the country backwards. The people
 * holding these screens are in Tunisia: the customer scanning a sticker on a
 * café table, and the owner reading the page that sells to them. French is
 * widely read here and it is one tap away in every masthead — but it is the
 * second language of the audience, not the first, and a product built for
 * Tunisia should not open in it by default.
 *
 * WHAT THIS DOES NOT CHANGE: the owner's app. /owner never calls this — the
 * till, Réglages and Analyses are French throughout, because that is where the
 * translation is not finished. Flipping a default is not the same as claiming
 * a screen is translated, and half a language is worse than one.
 */
export async function currentLang(): Promise<Lang> {
  const jar = await cookies();
  return jar.get(LANG_COOKIE)?.value === "fr" ? "fr" : "tn";
}

/** The translator for this request, in one call. */
export async function t(): Promise<ReturnType<typeof translator>> {
  return translator(await currentLang());
}
