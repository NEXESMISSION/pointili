/**
 * A believable shop logo, drawn — for fixtures and the demo seed only.
 *
 * Nothing in the product calls this: a real owner uploads their own mark in
 * Réglages. But every screenshot, demo and test café had `logo_url = null`,
 * which meant every one of them was judged with a grey emoji circle where the
 * shop's identity belongs — and "the card looks like a template" was the
 * conclusion, correctly, from a card that had no shop on it.
 *
 * A ring, a monogram, and a cup: enough to read as a small café's mark at
 * 46px, which is the size that actually matters.
 */
import sharp from "sharp";

/**
 * @param {string} name  the shop's name — its initial becomes the monogram
 * @param {string} ink   the mark's colour (usually the shop's brand colour)
 * @returns {Promise<string>} a PNG data URI, sized like an owner upload
 */
export async function shopLogo(name, ink = "#1f2937") {
  const letter = (name.trim()[0] ?? "P").toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <circle cx="128" cy="128" r="128" fill="#ffffff"/>
      <circle cx="128" cy="128" r="118" fill="none" stroke="${ink}" stroke-width="6"/>
      <circle cx="128" cy="128" r="104" fill="none" stroke="${ink}" stroke-width="2" opacity=".45"/>
      <!-- the cup: a saucer, a body, a handle. Flat, no gradients — it has to
           survive being drawn at 46 pixels. -->
      <ellipse cx="128" cy="186" rx="52" ry="8" fill="${ink}" opacity=".2"/>
      <path d="M84 120h74v28a34 34 0 0 1-34 34h-6a34 34 0 0 1-34-34z" fill="${ink}"/>
      <path d="M158 128h10a18 18 0 0 1 0 36h-4" fill="none" stroke="${ink}" stroke-width="9" stroke-linecap="round"/>
      <text x="128" y="98" text-anchor="middle" font-family="Georgia, serif" font-size="62"
            font-weight="700" fill="${ink}">${letter}</text>
    </svg>`;

  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}
