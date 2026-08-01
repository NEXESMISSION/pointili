"use client";

import { useEffect, useRef } from "react";
import { fmtPoints } from "@/lib/points";

/**
 * Counts a points figure up from what it was to what it is.
 *
 * This is not decoration. The card already knows both numbers —
 * balanceSinceLastOpen() returns { before, now } — and until now it spent them
 * only on deciding whether a reward had just become affordable. The badge
 * printed the total and said nothing about what had changed. So a customer who
 * earned 30 points last night opened their card and saw "230", exactly the way
 * they would have seen "200" the day before: the one thing they came to find
 * out was the one thing the screen did not say.
 *
 * Counting 200 → 230 says it without a word, in the language of every arcade
 * score and every bank app. The motion IS the message, which is the only good
 * reason to animate anything.
 *
 * WHY IT WRITES TO THE DOM INSTEAD OF HOLDING STATE
 *
 * A requestAnimationFrame loop that calls setState re-renders the tree sixty
 * times a second to change four characters, and trips react-hooks/set-state-in-
 * effect while doing it. Mutating textContent on a ref is both the cheaper and
 * the idiomatic way to drive a per-frame animation: React renders the final
 * value once, and the frames are just paint.
 *
 * TWO OTHER THINGS IT HAS TO GET RIGHT
 *
 * fmtPoints on every frame, not just at the end. Points are decimal since
 * migration 0027, and a raw interpolation would flash "217.40000000000003"
 * halfway through a count that lands on a clean "230".
 *
 * prefers-reduced-motion leaves the final value alone and never starts a loop.
 * Vestibular disorders are real, and a number that will not sit still is one of
 * the worse offenders.
 */
export function CountUp({
  from,
  to,
  /** Long enough to read as a climb, short enough not to delay the screen. */
  durationMs = 900,
  className = "",
}: {
  from: number;
  to: number;
  durationMs?: number;
  className?: string;
}) {
  const el = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const delta = to - from;
    // Nothing gained, or points were spent — a countdown reads as a loss even
    // when the customer chose it. Only a rise is worth animating.
    if (delta <= 0) return;

    let raf = 0;
    const started = performance.now();
    node.textContent = fmtPoints(from);

    const tick = (nowMs: number) => {
      const t = Math.min(1, (nowMs - started) / durationMs);
      // easeOutCubic: fast enough to feel responsive, settling rather than stopping.
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = fmtPoints(from + delta * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else node.textContent = fmtPoints(to); // land exactly, never on 229,98
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // Whatever interrupted us, the truth is the final number.
      node.textContent = fmtPoints(to);
    };
  }, [from, to, durationMs]);

  /*
    Rendered AT the final value. If the effect never runs — no JS, reduced
    motion, hydration mismatch — the correct number is already on screen and
    nothing has to repair it.
  */
  return (
    <span ref={el} className={className}>
      {fmtPoints(to)}
    </span>
  );
}
