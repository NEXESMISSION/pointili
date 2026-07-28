/*
  PLACEHOLDER ARTWORK — swap these two out.

  Both are inline SVG so the page has no asset dependency while the real images
  are being made. Each is drawn at the exact aspect ratio of the slot it fills,
  so replacing it with <Image> will not move anything around it.

  To swap: drop the real file in public/ and replace the component body with an
  <Image>. Keep the same wrapper classes.
*/

/** Hero: the phone showing a diner card, with the loyalty card floating in front. */
export function HeroArt({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 520"
      className={className}
      role="img"
      aria-label="Un téléphone affichant une carte de fidélité Pointili"
    >
      <defs>
        <linearGradient id="ha-glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity=".55" />
          <stop offset="100%" stopColor="#6d28d9" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ha-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#5b21b6" />
        </linearGradient>
        <linearGradient id="ha-phone" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#241c3d" />
          <stop offset="100%" stopColor="#120d22" />
        </linearGradient>
      </defs>

      {/* ambient glow */}
      <ellipse cx="250" cy="230" rx="190" ry="200" fill="url(#ha-glow)" />

      {/* phone */}
      <g transform="translate(150 30)">
        <rect x="0" y="0" width="240" height="470" rx="38" fill="url(#ha-phone)" stroke="#3a2f5c" strokeWidth="2" />
        <rect x="10" y="10" width="220" height="450" rx="30" fill="#0e0a1a" />
        <rect x="92" y="20" width="56" height="12" rx="6" fill="#241c3d" />

        <text x="28" y="66" fill="#9b8bc4" fontSize="11" fontFamily="system-ui">Bonjour 👋</text>
        <text x="28" y="92" fill="#fff" fontSize="17" fontWeight="700" fontFamily="system-ui">Chez Karim</text>
        <text x="28" y="110" fill="#7e6ea8" fontSize="10" fontFamily="system-ui">Espace café</text>

        <text x="28" y="150" fill="#7e6ea8" fontSize="10" fontFamily="system-ui">Vos points</text>
        <text x="28" y="192" fill="#fff" fontSize="42" fontWeight="800" fontFamily="system-ui">1250</text>
        <circle cx="150" cy="178" r="13" fill="#7c3aed" />
        <text x="150" y="183" fill="#fff" fontSize="13" textAnchor="middle" fontFamily="system-ui">✦</text>

        <rect x="24" y="214" width="192" height="62" rx="14" fill="#181229" />
        <text x="38" y="236" fill="#7e6ea8" fontSize="9" fontFamily="system-ui">Prochaine récompense</text>
        <text x="38" y="254" fill="#fff" fontSize="12" fontWeight="700" fontFamily="system-ui">1500 points</text>
        <rect x="38" y="262" width="164" height="5" rx="2.5" fill="#2a2145" />
        <rect x="38" y="262" width="136" height="5" rx="2.5" fill="#7c3aed" />

        <text x="28" y="300" fill="#7e6ea8" fontSize="9" fontFamily="system-ui">Récompenses disponibles</text>
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${28 + i * 64} 310)`}>
            <rect width="54" height="54" rx="14" fill="#181229" />
            <text x="27" y="35" fontSize="20" textAnchor="middle">{["☕", "🥐", "🥤"][i]}</text>
          </g>
        ))}

        <rect x="10" y="410" width="220" height="50" rx="0" fill="#120d22" />
        <text x="66" y="440" fill="#7c3aed" fontSize="9" textAnchor="middle" fontFamily="system-ui">Carte</text>
        <text x="174" y="440" fill="#5b4d80" fontSize="9" textAnchor="middle" fontFamily="system-ui">Récompenses</text>
      </g>

      {/* the loyalty card, floating in front */}
      <g transform="translate(30 175) rotate(-8)">
        <rect x="0" y="0" width="182" height="230" rx="18" fill="url(#ha-card)" />
        <text x="20" y="34" fill="#fff" fontSize="13" fontWeight="800" fontFamily="system-ui">◈ pointili</text>
        <text x="20" y="50" fill="#e2d9ff" fontSize="7.5" letterSpacing="1.2" fontFamily="system-ui">
          CARTE DE FIDÉLITÉ
        </text>
        {/* a stylised QR — not a scannable one */}
        <rect x="34" y="72" width="114" height="114" rx="8" fill="#fff" />
        {Array.from({ length: 36 }, (_, i) => {
          const r = Math.floor(i / 6);
          const c = i % 6;
          const on = [0, 1, 2, 5, 6, 8, 11, 12, 14, 15, 17, 20, 21, 23, 26, 29, 30, 33, 35].includes(i);
          return on ? (
            <rect key={i} x={44 + c * 16} y={82 + r * 16} width="12" height="12" rx="2" fill="#1a1030" />
          ) : null;
        })}
      </g>
    </svg>
  );
}

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
