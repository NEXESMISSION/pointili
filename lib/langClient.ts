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
  if (typeof document === "undefined") return "fr";
  const hit = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${LANG_COOKIE}=`));
  return hit?.slice(LANG_COOKIE.length + 1) === "tn" ? "tn" : "fr";
}
