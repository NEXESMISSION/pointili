/*
  PLACEHOLDER ARTWORK — one left.

  The hero placeholder is gone: /hero-phone.png is the real render now. This is
  the last drawn stand-in.

  Both are inline SVG so the page has no asset dependency while the real images
  are being made. Each is drawn at the exact aspect ratio of the slot it fills,
  so replacing it with <Image> will not move anything around it.

  To swap: drop the real file in public/ and replace the component body with an
  <Image>. Keep the same wrapper classes.
*/

/** Closing CTA: a little shop with a QR sign on the counter. */
export function ShopArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 170" className={className} role="img" aria-label="Une boutique avec son QR code">
      <defs>
        <linearGradient id="sa-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      {/* awning */}
      <path d="M26 52h148l-10 22H36Z" fill="#c4b5fd" />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={36 + i * 19} y="52" width="9.5" height="22" fill="#8b5cf6" />
      ))}
      {/* body */}
      <rect x="34" y="74" width="132" height="72" rx="6" fill="url(#sa-body)" />
      {/* window + door */}
      <rect x="46" y="88" width="44" height="38" rx="4" fill="#2e1065" opacity=".55" />
      <rect x="112" y="88" width="42" height="58" rx="4" fill="#2e1065" opacity=".55" />
      {/* sign board with QR */}
      <rect x="56" y="128" width="30" height="30" rx="4" fill="#fff" />
      {[0, 1, 2, 3, 5, 6, 8].map((i) => (
        <rect key={i} x={61 + (i % 3) * 7} y={133 + Math.floor(i / 3) * 7} width="5" height="5" fill="#2e1065" />
      ))}
      {/* plant */}
      <path d="M18 146c0-12 6-20 6-20s6 8 6 20Z" fill="#a78bfa" />
      <rect x="16" y="146" width="16" height="14" rx="3" fill="#7c3aed" />
      {/* ground */}
      <rect x="8" y="160" width="184" height="4" rx="2" fill="#4c1d95" opacity=".6" />
    </svg>
  );
}
