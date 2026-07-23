"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PlayResult, Prize } from "@/lib/types";

/**
 * The Spin (§10 · moment 2).
 *
 * The server picks the prize (POST /api/play); this component only *animates*
 * toward the answer it is given. Rotation is driven by rAF rather than a CSS
 * transition so we can emit a tick exactly as each segment passes the pointer —
 * that ticking slow-down IS the anticipation.
 */

const SIZE = 300;
const C = SIZE / 2;
const R = C - 6;
const SPIN_MS = 4600;
const TURNS = 5;

/**
 * Le Ticket's wheel: stamp-purple, gold, seal-red and ink, cycling. Gold is a
 * light field, so its label flips to ink — white on #B8860B fails contrast.
 */
const SEG = [
  { fill: "#5b3fd1", text: "#ffffff" }, // royal
  { fill: "#7b61ff", text: "#ffffff" }, // royal mauve
  { fill: "#b79cff", text: "#24123b" }, // lavender
  { fill: "#24123b", text: "#ffffff" }, // deep purple
];

/* ── the clock, as an external store ──────────────────────────────── */
const subscribeClock = (onChange: () => void) => {
  const id = setInterval(onChange, 30_000);
  return () => clearInterval(id);
};
/** Quantised: getSnapshot is compared with Object.is, so a raw Date.now() would
 *  change every millisecond and spin React forever. */
const clockSnapshot = () => Math.floor(Date.now() / 30_000);
const serverClockSnapshot = () => null;

/** "dans 3 h" / "dans 12 min" — never a raw timestamp. */
function formatWait(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "maintenant";
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `dans ${mins} min`;
  const hours = Math.ceil(mins / 60);
  if (hours < 24) return `dans ${hours} h`;
  return `dans ${Math.ceil(hours / 24)} j`;
}

/**
 * Point on the wheel edge, θ measured from 12 o'clock, clockwise.
 * Rounded: Math.sin/cos differ in the last float digit between Node and the
 * browser, which would desync the SSR markup from hydration.
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
  const largeArc = seg > 180 ? 1 : 0;
  return `M ${C} ${C} L ${x0} ${y0} A ${R} ${R} 0 ${largeArc} 1 ${x1} ${y1} Z`;
}

export function Wheel({
  slug,
  cafeName,
  prizes,
  nextPlayAt,
}: {
  slug: string;
  cafeName: string;
  prizes: Prize[];
  /** ISO string while the cooldown is running; null when a spin is available. */
  nextPlayAt?: string | null;
}) {
  const [phase, setPhase] = useState<"idle" | "spinning" | "revealed">("idle");
  const [result, setResult] = useState<PlayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(nextPlayAt ?? null);

  const wheelRef = useRef<SVGGElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const rotationRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const lastSegRef = useRef(0);
  const settledRef = useRef(false);

  const seg = 360 / prizes.length;

  /**
   * The clock is external mutable state, so subscribe to it properly.
   *
   * formatWait() reads Date.now(); computing that during render would let the
   * server and client straddle a minute boundary and desync hydration. The
   * server snapshot is null, so SSR and the hydrating render both show a
   * placeholder, and the real countdown appears (and ticks) after.
   */
  const clock = useSyncExternalStore(
    subscribeClock,
    clockSnapshot,
    serverClockSnapshot,
  );
  const waitText =
    lockedUntil && clock !== null ? formatWait(lockedUntil) : null;

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      void audioRef.current?.close();
    };
  }, []);

  /** The mechanical tick as a segment passes the pointer. */
  function playTick() {
    const ctx = audioRef.current;
    if (!ctx || ctx.state !== "running") return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 1150;
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.045);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  function setRotation(deg: number) {
    rotationRef.current = deg;
    wheelRef.current?.setAttribute("transform", `rotate(${deg} ${C} ${C})`);
  }

  async function spin() {
    if (phase === "spinning") return;
    setError(null);

    // Unlock audio on the user gesture (autoplay policy). Deliberately NOT
    // awaited: on devices with no audio output resume() can hang forever, and
    // sound must never gate the game.
    try {
      audioRef.current ??= new AudioContext();
      if (audioRef.current.state === "suspended") void audioRef.current.resume();
    } catch {
      // no audio — the spin still works, just silently
    }

    setPhase("spinning");

    let data: PlayResult;
    try {
      const res = await fetch("/api/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // The server is the authority on the cooldown: if it says we're early,
        // adopt its timestamp rather than arguing.
        if (res.status === 429 && body.nextPlayAt) {
          setLockedUntil(body.nextPlayAt);
        }
        throw new Error(body.error ?? "Impossible de jouer");
      }
      data = (await res.json()) as PlayResult;
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : "Impossible de jouer");
      return;
    }

    // Land the winning segment under the pointer at 12 o'clock.
    const idx = Math.max(0, prizes.findIndex((p) => p.id === data.prizeId));
    const jitter = (Math.random() - 0.5) * seg * 0.6; // not always dead-centre
    const want = (((-((idx + 0.5) * seg + jitter)) % 360) + 360) % 360;

    const start = rotationRef.current;
    const base = start + TURNS * 360;
    const end = base + (((want - (base % 360)) + 360) % 360);

    const t0 = performance.now();
    lastSegRef.current = Math.floor(start / seg);
    settledRef.current = false;

    // Land on the answer and show it. Idempotent — whichever of the animation
    // or the safety net gets here first wins.
    const settle = () => {
      if (settledRef.current) return;
      settledRef.current = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setRotation(end);
      setResult(data);
      setPhase("revealed");
      // the spin is spent — the cooldown starts now
      setLockedUntil(data.nextPlayAt);
    };

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      settle();
      return;
    }

    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / SPIN_MS);
      const eased = 1 - Math.pow(1 - t, 4); // easeOutQuart → the slow-down
      const rot = start + (end - start) * eased;
      setRotation(rot);

      const crossed = Math.floor(rot / seg);
      if (crossed !== lastSegRef.current) {
        lastSegRef.current = crossed;
        playTick();
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        settle();
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    // Safety net: rAF is paused while the tab is hidden (screen lock, app
    // switch). Without this the diner can come back to a wheel stuck on "…"
    // and never see what they won. The prize is already decided — always show it.
    timeoutRef.current = window.setTimeout(settle, SPIN_MS + 800);
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        {/* pointer */}
        <div
          aria-hidden
          className={`absolute left-1/2 top-[-6px] z-10 h-0 w-0 -translate-x-1/2 border-x-[11px] border-t-[20px] border-x-transparent border-t-seal drop-shadow ${
            phase === "spinning" ? "animate-pulse" : ""
          }`}
        />
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="drop-shadow-xl"
          role="img"
          aria-label="Roue des prix"
        >
          {/* ink rim, ringed in paper — the pressed-ticket look */}
          <circle cx={C} cy={C} r={R + 5} fill="#24123b" />
          <g ref={wheelRef}>
            {prizes.map((p, i) => {
              const { fill, text } = SEG[i % SEG.length];
              const mid = (i + 0.5) * seg;
              // Labels on the lower half would read upside-down — flip them.
              const flip = mid > 90 && mid < 270;
              const labelR = R * 0.64;
              const ty = C - labelR;
              /*
                Fit each label to the tangential room its slice actually gives it.
                The text reads across the segment, so a name wider than the slice's
                arc spills into its neighbours — worse as the owner adds prizes
                (more segments = thinner slices). Shrink to fit, with a legible
                floor. Deterministic, so SSR and hydration agree.
              */
              const room = labelR * ((seg * Math.PI) / 180) * 0.88;
              const fs = Math.max(
                7.5,
                Math.min(11.5, room / (p.label.length * 0.62)),
              ).toFixed(1);
              return (
                <g key={p.id}>
                  <path
                    d={segmentPath(i, seg)}
                    fill={fill}
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                  <g transform={`rotate(${mid} ${C} ${C})`}>
                    <text
                      x={C}
                      y={ty}
                      transform={flip ? `rotate(180 ${C} ${ty})` : undefined}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={text}
                      fontSize={fs}
                      fontWeight="700"
                      style={{ fontFamily: "var(--font-space-mono), monospace" }}
                    >
                      {p.label}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
          {/* hub — the brand's sparkle, not an emoji */}
          <circle cx={C} cy={C} r={26} fill="#ffffff" stroke="#24123b" strokeWidth={2} />
          <text
            x={C}
            y={C}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="20"
            fill="#5b3fd1"
          >
            ✦
          </text>
        </svg>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-seal/40 bg-seal-soft px-3 py-2 text-[13px] font-semibold text-seal">
          {error}
        </p>
      )}

      {/* Cooldown is the server's call — but show it here so the button never
          invites a tap that can only fail. */}
      {phase !== "revealed" && lockedUntil && (
        <div className="mt-6 w-full rounded-xl border border-line bg-paper2 py-3.5 text-center">
          <p className="ticket-label">Prochain tour</p>
          <p className="mt-0.5 text-[17px] text-ink">
            {waitText ?? "bientôt"}
          </p>
        </div>
      )}

      {phase !== "revealed" && !lockedUntil && (
        <button
          type="button"
          onClick={spin}
          disabled={phase === "spinning"}
          className="mt-6 w-full rounded-xl bg-brand py-3.5 text-[13px] font-bold text-white transition active:scale-95 disabled:opacity-60"
        >
          {phase === "spinning" ? "· · ·" : "Jouer ✦"}
        </button>
      )}

      {phase === "revealed" && result && (
        <Celebration result={result} cafeName={cafeName} slug={slug} />
      )}
    </div>
  );
}

/** Everyone wins → make it feel like winning (§11 #3). */
function Celebration({
  result,
  cafeName,
  slug,
}: {
  result: PlayResult;
  cafeName: string;
  slug: string;
}) {
  // The owner can now mark a slice "perdant" (a no-win). On that segment the
  // server sends no code — so the receipt must not claim a win or throw confetti.
  const lost = result.isLose;
  return (
    <>
      {!lost && <Confetti />}
      <div className="mt-6 w-full">
        {/* the win receipt, printed on paper stock */}
        <div className="relative rounded-lg border border-line bg-paper2 px-5 py-5 text-center shadow-[0_18px_30px_-22px_rgba(40,26,10,.7)]">
          <p className="text-[20px]">{cafeName}</p>
          <p className="ticket-label mt-1">{lost ? "Pas de chance" : "Tu as gagné"}</p>

          <p className="my-3 border-y border-line py-2.5 text-[19px] text-brand">
            {result.prizeLabel}
          </p>

          {result.code && (
            <>
              <p className="ticket-label">Code à présenter</p>
              <p className="mt-1.5 font-mono text-[22px] font-bold tracking-[0.2em] text-ink">
                {result.code}
              </p>
            </>
          )}

          <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
            {lost ? "— Retente ta chance bientôt —" : "— Merci de votre visite —"}
          </p>
        </div>

        {/*
          The prize is already saved server-side; the code (if any) lives on Ma
          carte. So this actually takes the diner there instead of silently
          dismissing the receipt under a label that promised otherwise.
        */}
        <Link
          href={`/${slug}`}
          className="mt-4 block w-full rounded-xl bg-brand py-3 text-center text-[12px] font-bold text-white active:scale-95"
        >
          {result.code ? "Voir mon code sur ma carte" : "Voir ma carte"}
        </Link>
      </div>
    </>
  );
}

function Confetti() {
  const bits = Array.from({ length: 44 }, (_, i) => i);
  const colors = ["#5b3fd1", "#7b61ff", "#b8860b", "#2f855a", "#c0341c"];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {bits.map((i) => {
        // deterministic-ish spread, no layout thrash
        const left = (i * 37) % 100;
        const delay = (i % 11) * 0.09;
        const dur = 2.4 + ((i % 5) * 0.3);
        return (
          <span
            key={i}
            className="absolute top-0 block h-2.5 w-1.5 rounded-[1px]"
            style={{
              left: `${left}%`,
              background: colors[i % colors.length],
              animation: `pointili-fall ${dur}s linear ${delay}s forwards`,
            }}
          />
        );
      })}
    </div>
  );
}
