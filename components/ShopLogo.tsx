import type { CardTheme } from "@/lib/types";

/**
 * The shop's logo, drawn the way the shop asked for it.
 *
 * WHY THIS IS A COMPONENT. Five screens drew a logo and all five wrote the same
 * line by hand — `rounded-full object-cover` — which is a crop. That is the
 * correct treatment for a photograph and the wrong one for a logo:
 *
 *   · a wide wordmark lost its first and last letters to the disc
 *   · a mark drawn on transparency got a white plate stamped behind it
 *   · anything that was not square lost whichever side was longer
 *
 * and no owner could do anything about it, because the crop was in the markup
 * rather than in their settings. Now it is one prop, read from the theme, and
 * changing it changes every surface at once instead of four out of five.
 *
 *   circle  the disc, filled edge to edge (object-cover). The default, and
 *           still the right answer for a photo or an off-centre mark.
 *   free    the whole logo inside the same box, its own proportions, nothing
 *           behind it (object-contain, no background, no rounding).
 *
 * The FALLBACK is unchanged and is deliberately not a logo: a shop with no
 * file gets its business-type emoji on the banner's own tint, which reads as a
 * shop rather than as a missing image.
 */
export function ShopLogo({
  url,
  shape,
  emoji,
  size,
  /** Ring colour for the circle form. Omitted means no ring. */
  ring,
  /** Tint behind the emoji fallback, and behind a circled logo while it loads. */
  tint,
  className = "",
}: {
  url: string | null;
  shape: CardTheme["logoShape"];
  emoji: string;
  /** Edge length in px. The box is square in both shapes — only the fit differs. */
  size: number;
  ring?: string;
  tint?: string;
  className?: string;
}) {
  const box = { width: size, height: size };

  if (!url) {
    return (
      <span
        className={`grid shrink-0 place-items-center rounded-full ${className}`}
        style={{ ...box, background: tint, fontSize: Math.round(size * 0.44) }}
      >
        <span className="shop-mark">{emoji}</span>
      </span>
    );
  }

  /*
    NO ROUNDING, NO BACKGROUND, NO RING on the free form — and that is the
    whole point of it rather than an oversight. A ring around an uncropped logo
    draws a circle the logo does not fill, which is the disc it was asking to
    escape; a tint behind a transparent PNG is the white plate it was asking to
    lose. object-contain inside the same square box keeps every surface's
    layout identical whichever shape a shop picks.
  */
  if (shape === "free") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
      <img
        src={url}
        alt=""
        data-shop-logo
        className={`shrink-0 object-contain ${className}`}
        style={box}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
    <img
      src={url}
      alt=""
      data-shop-logo
      className={`shrink-0 rounded-full object-cover ${className}`}
      style={{ ...box, background: tint, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}
    />
  );
}
