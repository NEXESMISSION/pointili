"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Every diner screen opens at its own top.
 *
 * THE BUG. Tapping "Récompenses" from halfway down a long card left the rewards
 * list already scrolled — sometimes past its own heading, so the screen opened
 * on a row of prices with no title above it. The App Router restores the
 * document scroll across a client-side navigation whenever it judges the target
 * to be "close enough", and on a phone column where every screen is the same
 * width and roughly the same shape, it judges wrong constantly.
 *
 * WHY NOT `<Link scroll>`: that prop is already true by default, which is
 * exactly why setting it changes nothing here — the reset it asks for is the
 * one being skipped. This does it unconditionally instead.
 *
 * BACK STILL RESTORES, and that is the whole subtlety.
 *
 * BackLink calls router.back() for most screens precisely so a customer returns
 * to the scroll position they left in a long rewards list. Scrolling to the top
 * on every pathname change would break that — so a popstate (the browser's own
 * back or forward, which is what router.back() fires) sets a flag that skips
 * the next reset. router.push(), the `exact` branch of BackLink, fires no
 * popstate and is treated as what it is: going somewhere new.
 *
 * Renders nothing. Mounted once in the diner layout, so it covers every screen
 * under /[slug] without any of them knowing about it.
 */
export function ScrollTop() {
  const pathname = usePathname();
  /* Ref, not state: flipping this must not itself cause a render, and it has to
     be readable by the effect below in the same commit that popstate landed. */
  const cameFromHistory = useRef(false);

  useEffect(() => {
    const onPop = () => {
      cameFromHistory.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (cameFromHistory.current) {
      cameFromHistory.current = false;
      return;
    }
    /* An in-page anchor is the one case where the top is the wrong place. The
       diner app has none today; this costs a property read and means adding
       one later does not quietly break it. */
    if (window.location.hash) return;
    /* instant, not smooth: a new screen should already be at its top when it
       paints, not slide there afterwards while the reader is looking at it. */
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
