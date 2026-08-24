"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * PULL DOWN TO REFRESH — but only inside the installed app.
 *
 * A browser already does this. An installed PWA does not: it has no address
 * bar, no reload button, and no gesture of its own, so the one thing every
 * phone owner knows how to do to a stale screen is unavailable on the surface
 * most likely to be stale — a card left open on a home screen for a week.
 *
 * So the gesture exists exactly where it is missing. `display-mode: standalone`
 * is the test, and it is checked at runtime rather than assumed: adding a second
 * pull-to-refresh underneath Chrome's own would fight it for the same twenty
 * pixels, and the visible symptom of that is a page that jumps.
 *
 * ── IT IS A LONG PULL ON PURPOSE ──────────────────────────────────────────
 *
 * 96px past a rubber-banded finger, which is most of a thumb's travel. Short
 * thresholds fire when somebody flicks a list upward from the very top, and a
 * refresh nobody asked for on a screen showing a balance reads as a bug. The
 * resistance curve means the finger always moves further than the indicator, so
 * the effort is visible before the commitment is made.
 *
 * ── AND IT NEVER FIGHTS A SCROLL ──────────────────────────────────────────
 *
 * The gesture only begins at the very top of the page, and only claims the
 * touch once the finger has clearly gone DOWNWARD rather than sideways or up.
 * Until that point every event passes through untouched, so a list still
 * scrolls, a horizontal row still swipes, and a tap is still a tap. The
 * listeners are non-passive only because a claimed pull has to be able to stop
 * the page moving under it.
 */

const TRIGGER = 96;
/** How far the finger travels for the last pixel of indicator — the drag. */
const RESISTANCE = 2.1;
const MAX = 140;

export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [busy, start] = useTransition();
  const startY = useRef<number | null>(null);
  const claimed = useRef(false);
  /*
    The pull lives in BOTH a ref and state, and they are written together.

    The touch handlers run outside React and need the live value; the indicator
    needs a render. Mirroring the state into a ref during render is the obvious
    shortcut and it is not allowed — a ref written while rendering is torn under
    concurrent rendering, and React lints it. One setter that writes both is the
    version that cannot drift.
  */
  const pullRef = useRef(0);
  const apply = useCallback((v: number) => {
    pullRef.current = v;
    setPull(v);
  }, []);

  useEffect(() => {
    /*
      Installed only. `display-mode: standalone` covers Android and desktop
      installs; iOS reports the same on modern versions and `navigator.standalone`
      is the fallback for the ones that do not.
    */
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: fullscreen)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    const down = (e: TouchEvent) => {
      /* Only from a page that is already at its top, and only a single finger —
         a pinch is not a pull. */
      if (e.touches.length !== 1 || window.scrollY > 0) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
      claimed.current = false;
    };

    const move = (e: TouchEvent) => {
      if (startY.current === null || busy) return;
      const dy = e.touches[0].clientY - startY.current;

      if (!claimed.current) {
        /* Sideways or upward: this was never our gesture. Let go completely. */
        if (dy < 12) {
          if (dy < -4) startY.current = null;
          return;
        }
        claimed.current = true;
      }

      /* Scrolled away mid-pull (a momentum scroll catching up): abandon. */
      if (window.scrollY > 0) {
        startY.current = null;
        claimed.current = false;
        apply(0);
        return;
      }

      /* Claimed: the page must not move under the finger. */
      if (e.cancelable) e.preventDefault();
      apply(Math.min(MAX, dy / RESISTANCE));
    };

    const up = () => {
      const reached = pullRef.current >= TRIGGER;
      startY.current = null;
      claimed.current = false;
      if (!reached) return apply(0);

      /*
        Hold the indicator at the trigger point while the refresh runs, so the
        spinner is where the finger left it rather than snapping to the top and
        back. router.refresh() inside a transition is what makes `busy` true
        until the new payload has actually arrived.
      */
      apply(TRIGGER);
      start(() => {
        router.refresh();
      });
    };

    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", up, { passive: true });
    document.addEventListener("touchcancel", up, { passive: true });
    return () => {
      document.removeEventListener("touchstart", down);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", up);
      document.removeEventListener("touchcancel", up);
    };
  }, [router, busy, apply]);

  /* The transition ended: let the indicator retire. */
  useEffect(() => {
    if (busy || pull === 0) return;
    const id = setTimeout(() => apply(0), 240);
    return () => clearTimeout(id);
  }, [busy, pull, apply]);

  if (pull === 0 && !busy) return null;

  const ready = pull >= TRIGGER;

  return (
    <div
      aria-hidden
      className="ptr fixed inset-x-0 top-0 z-[70] flex justify-center"
      style={{ transform: `translateY(${Math.max(0, pull - 34)}px)` }}
    >
      <span
        className={`ptr-dial ${busy ? "ptr-dial--busy" : ""}`}
        style={{
          /* Before the trigger the ring FILLS with the pull; after it, it is
             simply full. Nothing else on screen has to explain the gesture. */
          opacity: Math.min(1, pull / 40),
          transform: `rotate(${pull * 2.4}deg) scale(${ready || busy ? 1 : 0.82})`,
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-[19px] w-[19px]">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          {!busy && <path d="M21 3v6h-6" />}
        </svg>
      </span>
    </div>
  );
}
