"use server";

import { redirect } from "next/navigation";
import { clearDinerSession } from "@/lib/auth/diner";

/**
 * Sign out / switch account. Clears the signed session cookie.
 *
 * Lands on the GLOBAL door, never back on /[slug]/rejoindre. A shop can go dark
 * (suspended, or the plan lapsed) and its layout swallows the whole subtree
 * including that form — so signing out there destroyed the only session and
 * dropped the diner somewhere with no way back in.
 */
export async function logoutDinerAction(_slug: string) {
  await clearDinerSession();
  redirect("/moi");
}

/**
 * Move the "you have seen this card" mark — AFTER the page has been painted.
 *
 * This used to be `await touchCardOpened(...)` inside the card page's render,
 * and that is a write during render, which Next does not promise to run once.
 * A page is rendered for the RSC payload, again for SSR, again on a prefetch,
 * and twice over in dev — so an invisible pass spent the "since you last
 * looked" window and the pass the diner actually saw compared 160 against 160.
 *
 * That single fault produced both complaints: the unlock celebration failing
 * to appear when a reward really had just come into reach, and — when the
 * passes interleaved the other way — reappearing on every visit because no
 * render that DISPLAYED it had also advanced the mark.
 *
 * Now the mark moves exactly once, from the browser, for a page a human
 * actually looked at. A visitor with JavaScript disabled never advances it,
 * which is correct: the celebration is a JS overlay they were never shown, and
 * the only other thing the mark drives is the wallet's recency sort.
 */
export async function markCardOpenedAction(slug: string) {
  const { currentDiner } = await import("@/lib/auth/diner");
  const { getCafe } = await import("@/lib/data");
  const { touchCardOpened } = await import("@/lib/db");

  const phone = await currentDiner();
  if (!phone) return;
  const cafe = await getCafe(slug);
  if (!cafe) return;

  await touchCardOpened(cafe.id, phone);
}
