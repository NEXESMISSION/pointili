import Image from "next/image";

/**
 * The Pointili mark, on paper.
 *
 * The artwork (public/brand-mark.png) is a purple card on a transparent
 * background, and almost every surface in this product is dark purple. So on the
 * sign-in screen, the legal pages and the landing footer it was purple-on-purple
 * — a smudge next to a crisp white wordmark. The fix is not to recolour the
 * brand; it is to stop asking a purple mark to sit on a purple page.
 *
 * The tile colour is #f8f7fc, the same PAPER that scripts/icons.mjs bakes into
 * every generated icon. That is the point: the tab icon, the Android and iOS home
 * screen icons, the install bar and this lockup are all the same object, so a
 * shop owner who installs the app recognises what they installed.
 *
 * Used everywhere the mark meets a dark background. On a light one (app/not-found
 * or components/Logo) the bare mark is already correct and needs no tile.
 */
export function BrandMark({
  /** Tile edge in px. The mark is inset to ~58% of it, matching the app icon. */
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-xl bg-[#f8f7fc] ring-1 ring-black/5 ${className}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
    >
      <Image
        src="/brand-mark.png"
        alt=""
        width={size}
        height={Math.round(size * 0.73)}
        priority
        style={{ height: Math.round(size * 0.58), width: "auto" }}
      />
    </span>
  );
}

/**
 * Mark + wordmark, the lockup used in headers on dark backgrounds.
 *
 * The wordmark is live text rather than part of the image: it stays crisp at any
 * size and it can take the theme's accent on ".online" without a second asset.
 */
export function BrandLockup({
  size = 36,
  accent = "#b9a3ff",
  className = "",
  wordmarkClassName = "",
}: {
  size?: number;
  accent?: string;
  className?: string;
  /*
    Lets a caller drop the WORD and keep the mark. The landing masthead needs
    it: brand 165px + language 94px + the way in 104px does not fit a 390px
    phone, and it fits even less in Tunisian, where "فضاء المحلّ" is longer
    than "Espace café". Something had to go, and a logo without its wordmark is
    still the brand — a call to action clipped in half at the screen edge is
    not still a button.
  */
  wordmarkClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark size={size} />
      {/*
        INHERITS ITS COLOUR — it used to be hard-coded text-white.

        That was true of all three places it appeared while every one of them
        was a dark surface. The owner's sign-in screen is white now, and a white
        wordmark on a white page is an invisible brand on the first screen an
        owner ever sees. The landing and the legal pages set white on their own
        shells, so they are unaffected.
      */}
      <span
        className={`font-extrabold tracking-[-0.02em] ${wordmarkClassName}`}
        style={{ fontSize: Math.round(size * 0.5) }}
      >
        pointili<span style={{ color: accent }}>.online</span>
      </span>
    </span>
  );
}
