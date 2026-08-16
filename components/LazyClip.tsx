"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A demo clip that is not fetched until somebody is about to see it.
 *
 * THE BUG THIS EXISTS FOR. The clips were plain <video autoPlay muted loop
 * playsInline preload="none">, and the comment beside them said preload="none"
 * kept them off the wire until they were wanted. It does not: autoplay is a
 * declaration that the video is wanted, and the browser honours that over the
 * hint. Measured on the real page, a visitor who never scrolled past the hero
 * downloaded 1,685 KB of video they never saw — on a landing page for shop
 * owners in Tunisia, most of whom open it on 4G.
 *
 * The poster still loads, so the section looks finished before the clip
 * arrives: the poster IS a frame of the clip. What changes is that 1.7 MB is
 * spent when the reader reaches the section instead of while they are reading
 * the headline, where it competes with the hero image for the same connection.
 *
 * 400px of rootMargin, so the fetch starts a screen early and the clip is
 * usually playing by the time the card is actually in view.
 *
 * WITHOUT JAVASCRIPT it never loads, and that is the correct behaviour rather
 * than a gap: the poster is a still of the same screen, captioned by the same
 * words, and a reader with no JS sees a finished section instead of a hole.
 */
export function LazyClip({
  src,
  poster,
  label,
  className = "",
}: {
  src: string;
  poster?: string;
  /** Describes the screen for a reader who cannot see it. */
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [wanted, setWanted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || wanted) return;

    /*
      NO FALLBACK FOR A MISSING IntersectionObserver, deliberately. It has been
      in every shipping browser since 2019, and the graceful path already
      exists: the poster is a still of this exact screen under the same
      caption, which is what a reader with no JavaScript sees too. Setting the
      state synchronously here to cover it is a render-phase write in an
      effect — the thing react-hooks/set-state-in-effect exists to stop — and
      buying a browser nobody runs with a rule that catches real bugs is a bad
      trade.
    */
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setWanted(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [wanted]);

  return (
    <video
      ref={ref}
      /* src arrives with `wanted` — this is the whole mechanism. */
      src={wanted ? src : undefined}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="none"
      aria-label={label}
      className={className}
    />
  );
}
