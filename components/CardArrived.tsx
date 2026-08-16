"use client";

import { translator, type Lang } from "@/lib/dict";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The moment the card arrives.
 *
 * Joining is the one thing in this product worth marking. Somebody standing at a
 * table has just handed over a phone number and invented a secret code for a
 * shop they may have walked into once — and until now the reward for that was a
 * silent redirect onto a screen with a number on it. Nothing said "that worked",
 * nothing said "this is yours now", and the welcome points simply already
 * existed, as though they had always been there.
 *
 * So: the card flies in, lands, and the points stamp onto it.
 *
 * WHAT IT DELIBERATELY IS NOT
 *   - it does not delay anything. The real card is already rendered underneath;
 *     this is an overlay over a finished screen, and tapping anywhere ends it.
 *   - it does not repeat. The ?nouveau flag is stripped from the URL as soon as
 *     it plays, so a refresh, a back button or a shared link never replays it.
 *   - it is not a library. Four keyframes and eight spans — a confetti package
 *     would be heavier than the page it congratulates, on a phone on 3G at a
 *     café table.
 *   - it is not a blocker for reduced motion. With the preference set the same
 *     panel simply appears, says the same words, and waits.
 */
export function CardArrived({
  lang = "fr",
  play,
  cafeName,
  points,
}: {
  /*
    WHETHER TO PLAY — NOT WHETHER TO EXIST.

    This component is rendered by the card page unconditionally, and decides
    for itself. That is not a style preference, it is the fix for the bug that
    made it dead code:

    MarkOpened calls a server action on mount, and a server action re-renders
    the route it was called from. That second render is the one where the card
    has just been marked opened — so firstOpen is false, the page's condition
    is false, and a component that was rendered CONDITIONALLY simply vanishes,
    about one frame into a 4.2-second animation.

    Mounted always, the state below survives that re-render: a useState
    initialiser runs once for the life of the component and React keeps the
    value when the parent re-renders with different props. The celebration
    therefore outlives the write that ends its own eligibility.
  */
  play: boolean;
  cafeName: string;
  /** The welcome bonus, or 0 when the shop grants none. */
  points: number;
  /** The reader's language — a translator cannot cross the server boundary. */
  lang?: Lang;
}) {
  const t = translator(lang);
  const router = useRouter();
  const [open, setOpen] = useState(play);

  useEffect(() => {
    /*
      Strip the flag immediately, not on dismiss. If the person closes the tab
      mid-animation and reopens it from history, the celebration must not be
      waiting for them — the card is old news by then.

      ONLY WHEN THERE IS A FLAG, and that condition is the whole bug.

      This screen is reached two ways now. The old one is ?nouveau=1 from the
      join action. The new one is last_opened_at being null — the only honest
      signal for "seeing this card for the first time", because it also covers
      the walk-in whose card was made FOR them at the counter.

      Arriving the new way, there is no flag to strip, and this still ran: a
      router.replace onto the same route, which re-renders the server component.
      By then the card had been marked opened (components/MarkOpened fires on
      mount, one paint earlier), so firstOpen came back false, the page stopped
      rendering this component, and the 4.2s celebration below was cut down in
      about one frame. Nobody joining ever saw it. Not "it repeated" — it never
      played at all, on either path, for anyone.
    */
    if (!new URL(window.location.href).searchParams.has("nouveau")) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("nouveau");
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  useEffect(() => {
    // It congratulates and then gets out of the way. Long enough to read, short
    // enough that nobody has to dismiss it to use their card.
    const t = setTimeout(() => setOpen(false), 4200);
    return () => clearTimeout(t);
  }, []);

  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => setOpen(false)}
      className="arrive-veil fixed inset-0 z-50 flex flex-col items-center justify-center px-8 text-center"
    >
      {/*
        The card, arriving — IN THE SHOP'S COLOUR.

        The veil stays dark, because this is a spotlight and a white page cannot
        give one. But the object in the spotlight is the thing they have just
        been given, and it should already look like the card they will be
        opening tomorrow.
      */}
      <div
        className="arrive-card relative w-[248px] rounded-[22px] p-4 text-left shadow-[0_24px_60px_-18px_rgba(0,0,0,.9)]"
        style={{
          backgroundImage: [
            "radial-gradient(78% 62% at 6% -6%, color-mix(in oklab, var(--cafe-ink) 22%, transparent) 0%, transparent 62%)",
            "linear-gradient(160deg, var(--cafe) 0%, var(--cafe-deep) 100%)",
          ].join(","),
          color: "var(--cafe-ink)",
        }}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-70">
          {t("Carte de fidélité")}
        </p>
        <p className="mt-1 truncate text-[15.5px] font-extrabold">{cafeName}</p>
        {points > 0 && (
          <p className="arrive-points mt-5 text-[34px] font-extrabold leading-none tabular-nums">
            {/* dir=ltr: "+" is a Unicode neutral and lands at the wrong end of
                an RTL run — the welcome bonus read "230+". */}
            <span dir="ltr">+{points}</span>
            <span className="ml-1.5 align-middle text-[13px] font-bold opacity-70">
              {t.unit(points, "point")}
            </span>
          </p>
        )}
        {/* the points landing on it */}
        {points > 0 &&
          [0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              aria-hidden
              className="arrive-spark absolute text-[13px]"
              style={{
                left: `${12 + i * 15}%`,
                bottom: "18%",
                animationDelay: `${0.5 + i * 0.09}s`,
              }}
            >
              ✦
            </span>
          ))}
      </div>

      <p className="arrive-text mt-7 text-[17px] font-extrabold text-white">
        {t("Ta carte est prête")}
      </p>
      <p className="arrive-text mt-1 max-w-[26ch] text-[13px] leading-relaxed text-white/60">
        {points > 0
          ? t("{n} pour commencer. Montre ton code au comptoir à chaque achat.", {
              n: t.n(points, "point"),
            })
          : t("Montre ton code au comptoir à chaque achat.")}
      </p>
      <p className="arrive-text mt-5 text-[12px] text-white/35">{t("Touche pour continuer")}</p>
    </div>
  );
}
