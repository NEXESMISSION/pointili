"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { spinAction, type SpinState } from "./actions";
import { fmtPoints } from "@/lib/points";
import type { Prize } from "@/lib/types";

/**
 * La roue — on the store page, paid for in points.
 *
 * THE WHEEL DOES NOT DECIDE ANYTHING. spin_wheel() in migration 0029 draws the
 * segment in Postgres, debits the points under the same advisory lock a redeem
 * takes, and mints the code. By the time this component moves a single pixel
 * the prize is already a row in the database. What you see here is an animation
 * of a result that has already happened — it spins to where the server landed.
 *
 * That is the only honest way to build it. A wheel that picked its own prize in
 * the browser would be a wheel that always landed on the good one, for anybody
 * who opened the console.
 *
 * The odds are not hidden: the draw is uniform over the segments, so what the
 * diner sees on the wheel IS the probability. An owner who wants the expensive
 * prize to be rare adds more ordinary segments — a thing the customer can see.
 */

const C = 120; // centre
const R = 112; // radius
const TURNS = 5; // full rotations before landing
const SPIN_MS = 4200;

/* Alternating segment fills, diner palette. */
const FILLS = ["#7b52ff", "#5b3ad6", "#9a7bff", "#4a2fb8"];

/**
 * Point on the wheel edge, θ from 12 o'clock, clockwise.
 * Rounded to 3dp: Math.sin/cos differ in the last float digit between Node and
 * the browser, and an unrounded path desyncs the SSR markup from hydration.
 */
function pt(theta: number, radius: number) {
  const rad = (theta * Math.PI) / 180;
  return [
    (C + radius * Math.sin(rad)).toFixed(3),
    (C - radius * Math.cos(rad)).toFixed(3),
  ] as const;
}

function segmentPath(i: number, seg: number) {
  const [x0, y0] = pt(i * seg, R);
  const [x1, y1] = pt((i + 1) * seg, R);
  return `M ${C} ${C} L ${x0} ${y0} A ${R} ${R} 0 ${seg > 180 ? 1 : 0} 1 ${x1} ${y1} Z`;
}

export function WheelPlayer({
  slug,
  prizes,
  spinCost,
  balance,
}: {
  slug: string;
  prizes: Prize[];
  spinCost: number;
  balance: number;
}) {
  const [state, formAction, pending] = useActionState<SpinState, FormData>(
    spinAction.bind(null, slug),
    {},
  );

  const [rotation, setRotation] = useState(0);
  const [revealed, setRevealed] = useState<SpinState["ok"] | null>(null);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const seg = 360 / Math.max(1, prizes.length);
  const affordable = balance >= spinCost;

  /*
   * When a result lands, spin to it.
   *
   * The guard is `revealed`, a piece of STATE, not a ref. That is deliberate.
   * A ref set before starting the animation is not atomic with respect to the
   * cleanup below: React 19 double-invokes effects in development, so the first
   * pass would set the ref and start the rAF, cleanup would cancel it, and the
   * second pass would see the ref already set and bail — leaving the wheel
   * spinning forever on a prize the diner has already paid for. Guarding on the
   * settled result instead means a cancelled run simply starts again.
   */
  useEffect(() => {
    const ok = state.ok;
    if (!ok || revealed?.code === ok.code) return;

    const i = Math.max(0, prizes.findIndex((p) => p.id === ok.prizeId));
    /* Bring segment i's CENTRE under the pointer at 12 o'clock. */
    const target = TURNS * 360 - (i + 0.5) * seg;
    const start = rotation;
    const t0 = performance.now();
    let settled = false;

    const settle = () => {
      if (settled) return;
      settled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setRotation(target);
      setRevealed(ok);
    };

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      settle();
      return;
    }

    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / SPIN_MS);
      setRotation(start + (target - start) * (1 - Math.pow(1 - t, 4)));
      if (t < 1) rafRef.current = requestAnimationFrame(frame);
      else settle();
    };
    rafRef.current = requestAnimationFrame(frame);

    /* rAF is paused while the tab is hidden (screen lock, app switch). Without
       this the diner returns to a wheel stuck mid-turn and never learns what
       they won — and they have already paid for it. */
    timeoutRef.current = window.setTimeout(settle, SPIN_MS + 800);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, revealed]);

  const spinning = pending || (state.ok != null && revealed == null);

  return (
    <section className="d-card mb-4 px-5 py-6 text-center">
      <h2 className="text-[15.5px] font-extrabold text-white">La roue</h2>
      <p className="mx-auto mt-1 max-w-[30ch] text-[13px] text-white/55">
        {spinCost > 0
          ? `${fmtPoints(spinCost)} points le tour. Tout le monde repart avec quelque chose.`
          : "Un tour offert. Tout le monde repart avec quelque chose."}
      </p>

      <div className="relative mx-auto mt-5 w-[240px]">
        {/* the pointer, fixed at 12 o'clock */}
        <div
          aria-hidden
          className="absolute left-1/2 top-[-6px] z-10 h-0 w-0 -translate-x-1/2"
          style={{
            borderLeft: "9px solid transparent",
            borderRight: "9px solid transparent",
            borderTop: "16px solid #ffffff",
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,.45))",
          }}
        />
        <svg
          viewBox="0 0 240 240"
          className="w-full"
          style={{
            transform: `rotate(${rotation}deg)`,
            /* no CSS transition: the rAF loop owns the angle, and a transition
               on top of it fights the easing and overshoots the segment */
          }}
        >
          <circle cx={C} cy={C} r={R + 5} fill="rgba(255,255,255,.10)" />
          {prizes.map((p, i) => {
            const mid = (i + 0.5) * seg;
            const [lx, ly] = pt(mid, R * 0.64);
            return (
              <g key={p.id}>
                <path d={segmentPath(i, seg)} fill={FILLS[i % FILLS.length]} />
                <text
                  x={lx}
                  y={ly}
                  fill="#fff"
                  fontSize={prizes.length > 8 ? 8 : 10}
                  fontWeight="700"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${mid} ${lx} ${ly})`}
                >
                  {p.label.length > 14 ? `${p.label.slice(0, 13)}…` : p.label}
                </text>
              </g>
            );
          })}
          <circle cx={C} cy={C} r="17" fill="#0d0b14" stroke="rgba(255,255,255,.22)" strokeWidth="2" />
        </svg>
      </div>

      {revealed ? (
        <div className="mt-5">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-white/45">
            Tu as gagné
          </p>
          <p className="mt-1 text-[17px] font-extrabold text-white">{revealed.label}</p>
          <p className="mt-3 text-[12.5px] text-white/55">Montre ce code au comptoir</p>
          <p className="mt-1 font-mono text-[23px] font-extrabold tracking-[0.14em] text-[#b9a3ff]">
            {revealed.code}
          </p>
          <p className="mt-2 text-[12px] text-white/40">
            Pas de date limite · il te reste {fmtPoints(revealed.balance)} points
          </p>
        </div>
      ) : (
        <form action={formAction} className="mt-5">
          <button
            type="submit"
            disabled={spinning || !affordable}
            className="w-full rounded-2xl bg-white py-3.5 text-[14px] font-extrabold text-[#17121f] transition active:scale-[0.98] disabled:opacity-45"
          >
            {spinning
              ? "La roue tourne…"
              : affordable
                ? `Tourner · ${fmtPoints(spinCost)} points`
                : `Il te faut ${fmtPoints(spinCost)} points`}
          </button>
          {state.error && (
            <p className="mt-2 text-[13px] font-semibold text-[#ff9d9d]">{state.error}</p>
          )}
        </form>
      )}
    </section>
  );
}
