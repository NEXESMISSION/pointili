import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, translator, type Lang } from "./dict";

export { LANG_COOKIE, dir, translator, type Lang, type T } from "./dict";

/**
 * Which language this person reads — the cookie, or French.
 *
 * A preference of the PERSON, not of the shop and not of the URL: the address
 * on the sticker stuck to the table must mean the same thing for everybody who
 * scans it. See lib/dict for why the second language is Tunisian and not fusha.
 */
export async function currentLang(): Promise<Lang> {
  const jar = await cookies();
  return jar.get(LANG_COOKIE)?.value === "tn" ? "tn" : "fr";
}

/** The translator for this request, in one call. */
export async function t(): Promise<ReturnType<typeof translator>> {
  return translator(await currentLang());
}
