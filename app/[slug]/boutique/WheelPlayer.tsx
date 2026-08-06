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

/*
  Alternating segment fills, derived from the SHOP's colour at paint time.

  They used to be four fixed purples, which put our brand on the one animated
  object on the customer's screen. color-mix against the café's own hue keeps
  the wheel legible whatever they chose — white text sits on --cafe, and every
  segment is a step of the same colour rather than a different one.
*/
const FILLS = [
  "var(--cafe)",
  "color-mix(in oklab, var(--cafe), #000 22%)",
  "color-mix(in oklab, var(--cafe), #fff 18%)",
  "color-mix(in oklab, var(--cafe), #000 40%)",
];

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

  /* Closed until asked for — see the note on the trigger below. */
  const [open, setOpen] = useState(false);
  /* A spin costs points too — same rule as a reward: nothing is debited on one
     tap. See the confirmation under the wheel. */
  const [confirming, setConfirming] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [revealed, setRevealed] = useState<SpinState["ok"] | null>(null);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const wonRef = useRef<HTMLDivElement>(null);

  /*
    BRING THE PRIZE INTO VIEW.

    The wheel is tall, so the result lands at the bottom of the screen — and the
    bottom of this screen is where the tab bar is. Measured: the win's QR came
    out half-covered by it, on a phone, in the one second the diner turns the
    screen round to be scanned. A page you have to scroll before you can be
    served is not the fast path this exists to build.
  */
  useEffect(() => {
    if (!revealed) return;
    wonRef.current?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [revealed]);

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
    <>
      {/*
        ── THE TRIGGER ────────────────────────────────────────────────────
        A floating button, above the tab bar, thumb-height on the right.

        The wheel used to be the first thing on "Choisis ta récompense" — a
        240px game the customer had to scroll past to reach the rewards they
        came for. It is a diversion the shop switched on, not the point of the
        screen, so it waits to be asked for.
      */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`La roue — ${fmtPoints(spinCost)} points le tour`}
          className="fixed bottom-[86px] right-4 z-30 grid h-[62px] w-[62px] place-items-center rounded-full shadow-[0_12px_28px_-8px_rgba(23,18,31,.5)] transition active:scale-95"
          style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
        >
          <WheelMark />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="La roue"
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 px-3 pb-3 backdrop-blur-sm"
          onClick={() => !spinning && setOpen(false)}
        >
          <div
            className="d-card relative w-full max-w-[420px] px-5 py-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => !spinning && setOpen(false)}
              aria-label="Fermer"
              className="absolute right-6 top-6 grid h-9 w-9 place-items-center rounded-full bg-[var(--panel-2)] text-slate"
            >
              ×
            </button>
      <h2 className="text-[15.5px] font-extrabold text-charcoal">La roue</h2>
      <p className="mx-auto mt-1 max-w-[30ch] text-[13px] text-slate">
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
            /* charcoal, not white: the page behind it is white now and a white
               pointer on a white card is an invisible pointer */
            borderTop: "16px solid #1a1330",
            filter: "drop-shadow(0 2px 4px rgba(23,18,31,.28))",
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
          <circle cx={C} cy={C} r={R + 5} fill="var(--cafe-soft)" />
          {prizes.map((p, i) => {
            const mid = (i + 0.5) * seg;
            const [lx, ly] = pt(mid, R * 0.64);
            return (
              <g key={p.id}>
                <path d={segmentPath(i, seg)} fill={FILLS[i % FILLS.length]} />
                <text
                  x={lx}
                  y={ly}
                  /* whatever the shop's colour can carry — a fixed white label
                     disappears the moment somebody picks a pale brand */
                  fill="var(--cafe-ink)"
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
          <circle cx={C} cy={C} r="17" fill="#fff" stroke="var(--edge)" strokeWidth="2" />
        </svg>
      </div>

      {revealed ? (
        <div ref={wonRef} className="mt-5">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-slate">
            Tu as gagné
          </p>
          <p className="mt-1 text-[17px] font-extrabold text-charcoal">{revealed.label}</p>
          <p className="mt-3 text-[12.5px] text-slate">Fais scanner ça au comptoir</p>
          {/* Same pass zone as a bought reward — a win is collected by the same
              cashier pressing the same button, so it must not look like a
              different kind of object. */}
          <div
            className="mx-auto mt-2 w-[138px] rounded-2xl bg-white p-3"
            style={{ border: "1px solid var(--cafe-line)" }}
          >
            <div
              className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: revealed.qr }}
            />
          </div>
          <p
            className="mt-2.5 font-mono text-[23px] font-extrabold tracking-[0.14em]"
            style={{ color: "var(--cafe-text)" }}
          >
            {revealed.code}
          </p>
          <p className="mt-2 text-[12px] text-slate">
            Pas de date limite · il te reste {fmtPoints(revealed.balance)} points
          </p>
        </div>
      ) : (
        <form action={formAction} className="mt-5">
          {confirming ? (
            <div
              className="rounded-2xl px-4 py-3.5"
              style={{ background: "var(--cafe-soft)", border: "1px solid var(--cafe-line)" }}
            >
              <p className="text-[13.5px] font-extrabold leading-snug text-charcoal">
                Dépenser {fmtPoints(spinCost)} points pour un tour ?
              </p>
              <p className="mt-1 text-[12px] leading-snug text-slate">
                Il te restera{" "}
                <b className="font-bold text-charcoal">{fmtPoints(balance - spinCost)} points</b>.
                Tout le monde repart avec quelque chose.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="d-card min-h-[46px] text-[13.5px] font-bold text-charcoal active:scale-[0.99]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={spinning}
                  className="min-h-[46px] rounded-2xl text-[13.5px] font-extrabold transition active:scale-[0.98] disabled:opacity-50"
                  style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
                >
                  {spinning ? "· · ·" : "Oui, tourner"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={spinning || !affordable}
              className="w-full rounded-2xl py-3.5 text-[14px] font-extrabold transition active:scale-[0.98] disabled:opacity-45"
              style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
            >
              {spinning
                ? "La roue tourne…"
                : affordable
                  ? `Tourner · ${fmtPoints(spinCost)} points`
                  : `Il te faut ${fmtPoints(spinCost)} points`}
            </button>
          )}
          {state.error && (
            <p className="mt-2 text-[13px] font-semibold text-seal">{state.error}</p>
          )}
        </form>
      )}
          </div>
        </div>
      )}
    </>
  );
}

/** A wheel, drawn small — the trigger has to say "game" without a caption. */
function WheelMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18" strokeLinecap="round" opacity=".8" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
