"use client";

import { useEffect, useRef, useState } from "react";
import { BRAND_COLOR } from "@/lib/brand";
import { CheckIcon, GiftIcon, Sparkle } from "@/components/icons";

/*
  THE PRODUCT, RUNNING, INSTEAD OF FOUR SENTENCES ABOUT IT.

  "Comment ça marche" was four icons and a caption each — a description of a
  loop nobody doubts. Everything a visitor had to believe was an assertion by
  the page. This shows the loop happening on a card that is built from the
  SAME CSS the real card uses: .d-card, .d-stamp, .d-stamp--empty, .d-soft, and
  --cafe for the shop colour. It cannot drift into looking like a different
  product, because it is wearing the product's own clothes.

  WHY THIS IS NOT A GIF OR A VIDEO

  A screen recording of a phone is 1–3 MB, blurry on a retina display, fixed at
  one width, and stale the day any screen changes. This is a couple of KB of
  markup, sharp at every density, reflows on a narrow phone, and updates itself
  whenever the design tokens change. On Tunisian 4G that difference is the
  difference between a page that loads and one that does not.

  IT PAUSES WHEN NOBODY IS LOOKING

  An IntersectionObserver stops the timer when the section scrolls away.
  A loop animating forever in a background tab is battery a visitor did not
  agree to spend — and on a phone that is a real cost, not a rounding error.

  REDUCED MOTION

  No auto-advance and no transitions; the steps become an ordinary tab strip
  that a visitor drives themselves. The information is identical either way,
  which is the test for whether motion was carrying meaning or decorating it.
*/

type Step = { key: string; who: "Vous" | "Le client"; label: string; caption: string };

const STEPS: Step[] = [
  { key: "pay", who: "Le client", label: "Il paie", caption: "Vous tapez 12,5 DT à la caisse. Les points se calculent tout seuls, à votre taux." },
  { key: "stamp", who: "Le client", label: "Il revient", caption: "Un tampon de plus. Votre carte en carton, sauf qu'elle ne se perd pas." },
  { key: "unlock", who: "Le client", label: "Il débloque", caption: "Sa carte le lui annonce à l'ouverture. Vous n'avez rien à faire." },
  { key: "redeem", who: "Vous", label: "Il échange", caption: "Six caractères. Vous vérifiez, puis vous validez — utilisables une seule fois." },
];

const FILLED = [3, 4, 5]; // stamps before → after, so step 2 lands one visibly

export function LiveDemo() {
  const [i, setI] = useState(0);
  /*
    Starts TRUE, and the observer below may only turn it off.

    Gating the animation on the observer having fired means a browser where it
    never fires shows a demo frozen on step 1 — which looks exactly like a broken
    page and is worse than an animation nobody is watching. Fail open: play by
    default, pause on evidence of being off-screen.
  */
  const [live, setLive] = useState(true);
  const box = useRef<HTMLDivElement>(null);

  // Only run while on screen.
  useEffect(() => {
    const node = box.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    /*
      threshold 0, NOT a fraction. The threshold is the share of the TARGET that
      is visible, and this target is a two-column block that is taller than a
      phone viewport — at 0.35 it could never qualify, so the demo sat frozen on
      step 1 forever while looking perfectly alive to the code. "Any part of it
      is on screen" is also the question actually being asked.
    */
    const io = new IntersectionObserver(([e]) => setLive(e.isIntersecting), { threshold: 0 });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!live) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % STEPS.length), 2600);
    return () => clearInterval(t);
  }, [live]);

  const stamps = i >= 1 ? FILLED[1] : FILLED[0];
  const points = i === 0 ? 230 : 242;

  return (
    <div ref={box} className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_320px] md:gap-14">
      {/* ── the steps, as a driveable list ─────────────────────────── */}
      <ol className="order-2 space-y-2.5 md:order-1">
        {STEPS.map((s, n) => {
          const on = n === i;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => setI(n)}
                aria-current={on ? "step" : undefined}
                className={`flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition ${
                  on
                    ? "border-[#8b5cf6]/50 bg-[#7c3aed]/[0.10]"
                    : "border-white/[0.07] bg-white/[0.02] hover:border-white/15"
                }`}
              >
                <span
                  className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold tabular-nums transition ${
                    on ? "bg-[#7c3aed] text-white" : "bg-white/[0.07] text-white/45"
                  }`}
                >
                  {n + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-white">{s.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em] ${
                        s.who === "Vous" ? "bg-[#7c3aed] text-white" : "bg-white/10 text-white/60"
                      }`}
                    >
                      {s.who}
                    </span>
                  </span>
                  <span className="mt-1 block text-[13px] leading-snug text-white/55">
                    {s.caption}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* ── the card, in the product's own CSS ─────────────────────── */}
      <div
        className="order-1 mx-auto w-full max-w-[300px] md:order-2"
        style={{ ["--cafe" as string]: BRAND_COLOR }}
      >
        <div className="relative rounded-[34px] border-[7px] border-[#1b1430] bg-[#0b0616] p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)]">
          {/* notch */}
          <span aria-hidden className="absolute left-1/2 top-1.5 h-[5px] w-16 -translate-x-1/2 rounded-full bg-white/12" />

          {/* greeting + the balance */}
          <div className="mb-3 mt-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10.5px] text-white/55">Bonjour</p>
              <p className="truncate text-[17px] font-extrabold leading-tight text-white">Yassine</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-2.5 py-1.5 ring-1 ring-white/15">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-white/90" style={{ color: BRAND_COLOR }}>
                <Sparkle className="h-3 w-3" />
              </span>
              <span className="leading-none">
                <span className="block text-[14px] font-extrabold tabular-nums text-white">{points}</span>
                <span className="block text-[8px] font-semibold text-white/55">points</span>
              </span>
            </div>
          </div>

          {/* the stamp card */}
          <div className="d-card p-3.5">
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: 10 }).map((_, n) => {
                const filled = n < stamps;
                const justLanded = i === 1 && n === FILLED[1] - 1;
                return (
                  <span
                    key={n}
                    className={`grid aspect-square place-items-center rounded-full transition-all duration-500 ${
                      filled ? "d-stamp" : "d-stamp--empty"
                    } ${justLanded ? "scale-110" : "scale-100"}`}
                  >
                    {filled ? <Sparkle className="h-3 w-3" /> : null}
                  </span>
                );
              })}
            </div>
            <p className="mt-2.5 text-center text-[10px] text-white/55">
              {10 - stamps} visites pour votre récompense
            </p>
          </div>

          {/* what the step produces */}
          <div className="mt-3 min-h-[74px]">
            {i === 0 && (
              <div className="d-soft px-3 py-3 text-center">
                <p className="text-[11px] text-white/55">12,5 DT encaissés</p>
                <p className="text-[17px] font-extrabold text-[#7ff0b0]">+12,5 points</p>
              </div>
            )}
            {i === 1 && (
              <div className="d-soft px-3 py-3 text-center">
                <p className="text-[11px] text-white/55">Tampon ajouté</p>
                <p className="text-[15px] font-extrabold text-white">{stamps} / 10</p>
              </div>
            )}
            {i === 2 && (
              <div className="rounded-2xl border border-[#ffd27a]/40 bg-[#ffd27a]/[0.10] px-3 py-3 text-center">
                <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[#ffd27a]">
                  <GiftIcon className="h-3 w-3" /> Récompense débloquée
                </p>
                <p className="mt-0.5 text-[14px] font-extrabold text-white">Café offert</p>
              </div>
            )}
            {i === 3 && (
              <div className="rounded-2xl border-2 border-[#8b6bff] bg-[#6d4ae6]/12 px-3 py-3 text-center shadow-[0_0_22px_-6px_rgba(139,107,255,.8)]">
                <p className="font-mono text-[19px] font-extrabold tracking-[0.16em] text-white">
                  T9BX52
                </p>
                <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-[#7ff0b0]">
                  <CheckIcon className="h-3 w-3" /> Validé au comptoir
                </p>
              </div>
            )}
          </div>
        </div>

        {/*
          THE OTHER HAND.

          The card above is the customer's. The person reading this page is the
          one who PAYS, and watching a customer's screen leaves them asking "yes,
          but what do I do?". So the counter's side of the very same step sits
          under it, in the owner design system (.a-card, .a-btn) rather than the
          diner one — the two surfaces really do look different, and pretending
          otherwise would be the dishonest kind of demo.

          It also makes the strongest point on the page without a sentence of
          argument: on two of the four steps the answer is "nothing". The loop
          mostly runs without them.
        */}
        <div className="a-card mt-3 p-3">
          <p className="mb-2 text-[9.5px] font-bold uppercase tracking-[0.1em] text-white/40">
            À la caisse
          </p>

          {i === 0 && (
            <div className="flex items-center gap-2">
              <span className="flex-1 rounded-xl border border-white/14 bg-white/[0.06] px-3 py-2 text-left font-mono text-[15px] font-bold tabular-nums text-white">
                12,5
                <span className="ml-1 text-[10px] font-semibold text-white/45">DT</span>
              </span>
              <span className="rounded-xl bg-[#6d4ae6] px-3.5 py-2.5 text-[12px] font-bold text-white">
                Créditer
              </span>
            </div>
          )}

          {i === 3 && (
            <div className="flex items-center gap-2">
              <span className="flex-1 rounded-xl border border-white/14 bg-white/[0.06] px-3 py-2 text-left font-mono text-[15px] font-bold tracking-[0.1em] text-white">
                T9BX52
              </span>
              <span className="rounded-xl bg-[#6d4ae6] px-3.5 py-2.5 text-[12px] font-bold text-white">
                Valider
              </span>
            </div>
          )}

          {(i === 1 || i === 2) && (
            <p className="py-2 text-center text-[12px] font-semibold text-white/35">
              Rien à faire — ça se passe tout seul.
            </p>
          )}
        </div>

        {/* honesty: this is a demonstration, nothing is being recorded */}
        <p className="mt-3 text-center text-[10.5px] text-white/35">
          Démonstration — aucun numéro demandé.
        </p>
      </div>
    </div>
  );
}
