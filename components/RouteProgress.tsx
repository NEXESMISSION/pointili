"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * ── SOMETHING HAPPENED WHEN YOU PRESSED THAT ──────────────────────────────
 *
 * This app used to answer every navigation with a full-screen logo. That was
 * wrong — it threw away the screen you were reading to tell you something you
 * could already see — so it went, and it was replaced with a lit tab in the two
 * nav bars and a spinning chevron on cards.
 *
 * Which covered three components out of the whole product. A settings row, a
 * reward, a wallet card, "Tout voir", a back arrow, every form that posts to a
 * server action: press any of them on a slow connection and the screen sat
 * there, perfectly still, for a second and a half. People press again. That is
 * the report, and it is fair.
 *
 * So: one bar, at the top of everything, for every navigation in the product —
 * including the ones nobody remembered to instrument, and the ones not written
 * yet.
 *
 * ── WHY IT LISTENS FOR CLICKS INSTEAD OF ASKING THE ROUTER ────────────────
 * The App Router has no navigation-events API. useLinkStatus exists but is
 * per-<Link> — it only helps a component that already knows to ask. A global
 * listener is the only thing that can cover a product this size without
 * touching two hundred call sites, and it degrades honestly: an anchor it
 * fails to recognise simply shows no bar, exactly as today.
 *
 * ── THE DETAILS THAT MAKE IT NOT ANNOYING ─────────────────────────────────
 *   · 140ms delay. A prefetched route resolves in under that and the bar never
 *     appears, so fast navigation stays visually silent — which is the point.
 *   · It creeps toward 90% and stops. Nothing here knows the real progress and
 *     a bar that pretends to would reach 100% while the page is still coming.
 *   · pathname changing is what finishes it.
 *   · A 15s ceiling, because a bar that never leaves is worse than no bar: a
 *     download, a new tab, a cancelled navigation must not leave it stuck.
 *   · var(--cafe) with a fallback: inside a shop it is that shop's colour,
 *     everywhere else it is ours. One component, no props, right on both.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [value, setValue] = useState<number | null>(null); // null = hidden
  const timers = useRef<number[]>([]);
  const creep = useRef<number | null>(null);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (creep.current) {
      clearInterval(creep.current);
      creep.current = null;
    }
  };

  /* A navigation was asked for. */
  const start = () => {
    clear();
    timers.current.push(
      window.setTimeout(() => {
        setValue(8);
        creep.current = window.setInterval(() => {
          /* decelerating: fast to a third, then slower the closer it gets, so
             it never looks stalled and never claims to be finished */
          setValue((v) => (v === null ? v : v + Math.max(0.4, (90 - v) / 14)));
        }, 240);
        /* the ceiling */
        timers.current.push(window.setTimeout(() => finish(), 15000));
      }, 140),
    );
  };

  const finish = () => {
    clear();
    setValue((v) => (v === null ? null : 100));
    timers.current.push(window.setTimeout(() => setValue(null), 260));
  };

  /* The route changed — whatever we were waiting for has arrived. */
  useEffect(() => {
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pathname is the signal
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      /* a modified click is "open somewhere else", not a navigation here */
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const a = (e.target as Element | null)?.closest?.("a");
      if (!(a instanceof HTMLAnchorElement)) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;

      const href = a.getAttribute("href") ?? "";
      if (!href || href.startsWith("#")) return;

      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      /* same page, different hash — nothing is being fetched */
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      start();
    };

    /*
      Forms too. Every mutation in this product is a server action posted by a
      form — crediting points, buying a reward, saving settings — and those are
      the presses where a person is most anxious that nothing happened.
    */
    const onSubmit = (e: SubmitEvent) => {
      if (e.defaultPrevented) return;
      const form = e.target;
      if (form instanceof HTMLFormElement && form.dataset.noProgress !== "") start();
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    /* Leaving for a real page load (or the back button restoring a bfcache
       entry) must not leave a bar behind. */
    window.addEventListener("pagehide", finish);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("pagehide", finish);
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listeners are stable
  }, []);

  if (value === null) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
      /* above the notch on an installed phone, where the top 40px is chrome */
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div
        className="h-full origin-left rounded-r-full transition-transform duration-200 ease-out"
        style={{
          background: "var(--cafe, #5b3fd1)",
          transform: `scaleX(${Math.min(value, 100) / 100})`,
          opacity: value >= 100 ? 0 : 1,
          transitionProperty: "transform, opacity",
        }}
      />
    </div>
  );
}
