"use client";

import { LANG_COOKIE, type Lang } from "./dict";

/**
 * The reader's language, from the browser — for the one component that cannot
 * be handed it.
 *
 * Everywhere else a client component gets `lang` as a prop from the server
 * parent that read the cookie, which is correct: it renders on the server too,
 * so the first paint is already in the right language. app/[slug]/error.tsx
 * cannot do that. An error boundary is mounted by React when a render below it
 * has already failed — there is no server parent left to pass anything down,
 * and it takes exactly two props, both from Next.
 *
 * So it reads the same cookie the server reads. Guarded for the server pass
 * because an error boundary still renders there, and `document` would throw
 * and replace a handled error screen with an unhandled one.
 */
export function langFromCookie(): Lang {
  /*
    THE DEFAULT HAS TO MATCH THE SERVER'S, and the server's is Tunisian.

    lib/i18n's currentLang() reads `=== "fr" ? "fr" : "tn"` — absent means
    Tunisian. This read the same cookie and defaulted the other way, so a
    customer with no cookie got a Tunisian app and a FRENCH error screen: the
    one moment the two disagreed was the one moment the disagreement was
    visible.

    The two defaults are written as the same expression on purpose. If the
    product's default language changes again, these are the two lines to change
    together, and they now look alike enough to find.
  */
  if (typeof document === "undefined") return "tn";
  const hit = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${LANG_COOKIE}=`));
  return hit?.slice(LANG_COOKIE.length + 1) === "fr" ? "fr" : "tn";
}
