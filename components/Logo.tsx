import Image from "next/image";

/**
 * Brand lockup for tight spaces (headers, navs).
 *
 * The supplied wordmark PNG has "Drink. Earn. Play. Win." baked into it, so at
 * header size the tagline collapses into unreadable mush. Here we pair the icon
 * with LIVE text: crisp at any size, and it picks up the theme colours.
 *
 * Use the full PNG lockup (/logo-full.png, /logo-wordmark.png) only where it can
 * be shown large enough for the tagline to actually read.
 */
export function Logo({
  className = "",
  size = 22,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Image
        src="/brand-mark.png"
        alt=""
        width={size}
        height={size}
        style={{ height: size, width: "auto" }}
        priority
      />
      <span
        className="font-bold tracking-[-0.02em] text-ink"
        style={{ fontSize: size * 0.82 }}
      >
        pointili<span className="text-brand">.online</span>
      </span>
    </span>
  );
}
