/**
 * Reward artwork, drawn rather than downloaded.
 *
 *   node scripts/reward-art.mjs
 *
 * loyalty_rewards has had an image_url column all along and nothing ever filled
 * it, so every reward — on the customer's card, in the boutique, on the code they
 * show at the counter — fell back to the same grey gift glyph. Four rewards, one
 * icon, four times. That is what makes a real shop's card look like a template.
 *
 * DRAWN, and that is a decision, not a limitation. Stock photography for a café
 * in Tunis would be someone else's espresso, someone else's copyright, and 200 KB
 * per reward on a phone on 3G. These are flat SVG, rendered once to PNG:
 * ~6 KB each, the same palette across the set, and no licence attached.
 *
 * The style rules, so a new item drops in without redesigning anything:
 *   - one square, one object, centred, generous margin
 *   - a warm tinted field per item so the boutique list reads as a row of
 *     different things rather than a row of purple squares
 *   - flat shapes only, no gradients inside the object, no text
 *   - the object fills ~62% of the square, matching the icon set's inset
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const OUT = "public/rewards";
const SIZE = 480;

/* Warm, muted fields. Deliberately not the brand purple: these sit ON purple. */
const FIELD = {
  cream: ["#f6ead8", "#e8d3b4"],
  rose: ["#f7dfe2", "#eec3c8"],
  mint: ["#d9efe3", "#b8ddc9"],
  sky: ["#dce7f7", "#bfd2ee"],
  sand: ["#f3e6cf", "#e2cfa8"],
  plum: ["#e9dff6", "#d3c2ec"],
};

const INK = "#3b2a55";
const COFFEE = "#6f4426";
const COFFEE_DARK = "#4a2b16";
const CREAM = "#fbf3e6";
const GOLD = "#e8a33d";
const LEAF = "#3f8f5f";

/**
 * A cup, with its size as the point.
 *
 * The first pass drew one cup for both coffees and changed only the colour, so an
 * espresso and a cappuccino were indistinguishable in a list — which is exactly
 * the failure this whole set exists to fix. A demitasse is SMALL and sits on a
 * saucer; a cappuccino cup is wide and carries foam. The silhouette has to do the
 * work, because at 44px in the boutique list the fill colour is all anyone sees
 * of the inside.
 */
const cup = ({ fill, foam = null, w = 190, top = 176, saucer = false }) => {
  const cx = 240;
  const h = Math.round(w * 0.62);
  const l = cx - w / 2;
  const bowl = w * 0.5;
  return `
  <ellipse cx="${cx}" cy="${top + h + (saucer ? 30 : 14)}" rx="${w * 0.72}" ry="${w * 0.13}" fill="${INK}" opacity=".12"/>
  ${saucer ? `<ellipse cx="${cx}" cy="${top + h + 22}" rx="${w * 0.78}" ry="${w * 0.2}" fill="${CREAM}"/>` : ""}
  <path d="M${l} ${top}h${w}v${h * 0.42}a${bowl} ${bowl} 0 0 1-${bowl} ${bowl}h0a${bowl} ${bowl} 0 0 1-${bowl}-${bowl}Z" fill="${CREAM}"/>
  <path d="M${l + 13} ${top + 13}h${w - 26}v${h * 0.3}a${bowl - 13} ${bowl - 13} 0 0 1-${bowl - 13} ${bowl - 13}h0a${bowl - 13} ${bowl - 13} 0 0 1-${bowl - 13}-${bowl - 13}Z" fill="${fill}"/>
  ${foam ? `<ellipse cx="${cx}" cy="${top + 17}" rx="${w * 0.42}" ry="${w * 0.085}" fill="${foam}"/>
            <ellipse cx="${cx}" cy="${top + 17}" rx="${w * 0.2}" ry="${w * 0.04}" fill="#efe0c6"/>` : ""}
  <path d="M${l + w} ${top + 22}h${w * 0.11}a${w * 0.16} ${w * 0.16} 0 0 1 0 ${w * 0.32}h-${w * 0.11}"
        fill="none" stroke="${CREAM}" stroke-width="${Math.round(w * 0.1)}" stroke-linecap="round"/>`;
};

/** A round plate with something on it. Bigger than the first pass — the plate
 *  items all read as specks next to the cups. */
const plate = (inner) => `
  <ellipse cx="240" cy="356" rx="152" ry="30" fill="${INK}" opacity=".12"/>
  <ellipse cx="240" cy="336" rx="152" ry="46" fill="${CREAM}"/>
  <ellipse cx="240" cy="330" rx="118" ry="33" fill="#eee3d1"/>
  ${inner}
`;

const ITEMS = {
  // small cup, saucer: an espresso is recognised by being tiny
  "espresso-offert": {
    field: FIELD.cream,
    art: cup({ fill: COFFEE_DARK, w: 128, top: 196, saucer: true }),
  },
  // wide cup, foam on top
  "cappuccino-offert": {
    field: FIELD.sand,
    art: cup({ fill: COFFEE, foam: CREAM, w: 208, top: 172 }),
  },
  "the-a-la-menthe": {
    field: FIELD.mint,
    art: `
      <ellipse cx="240" cy="368" rx="112" ry="22" fill="${INK}" opacity=".12"/>
      <path d="M172 138h136l-15 190a30 30 0 0 1-30 28h-46a30 30 0 0 1-30-28Z" fill="${CREAM}" opacity=".9"/>
      <path d="M184 168h112l-13 158a17 17 0 0 1-17 16h-52a17 17 0 0 1-17-16Z" fill="#c9a13c"/>
      <!-- the sprig sits ON the rim, not floating over it -->
      <path d="M240 168c-30-6-44-30-36-52 22 6 36 26 36 52Z" fill="${LEAF}"/>
      <path d="M244 168c26-12 32-38 20-56-18 14-22 34-20 56Z" fill="#5aa877"/>
      <path d="M204 116c14 8 26 26 34 50" fill="none" stroke="#2f6f49" stroke-width="5" stroke-linecap="round"/>
    `,
  },
  "jus-dorange": {
    field: FIELD.sand,
    art: `
      <ellipse cx="240" cy="368" rx="104" ry="20" fill="${INK}" opacity=".12"/>
      <path d="M184 126h112l-14 202a26 26 0 0 1-26 24h-32a26 26 0 0 1-26-24Z" fill="#fff" opacity=".9"/>
      <path d="M190 176h100l-12 152a16 16 0 0 1-16 15h-44a16 16 0 0 1-16-15Z" fill="${GOLD}"/>
      <rect x="252" y="84" width="15" height="76" rx="7" fill="#e2637a" transform="rotate(16 259 122)"/>
      <circle cx="318" cy="176" r="38" fill="#f0b455"/>
      <path d="M318 138a38 38 0 0 0 0 76Z" fill="#e08c2c"/>
      <path d="M318 152v48M300 176h36" stroke="#fff" stroke-width="4" opacity=".5"/>
    `,
  },
  "patisserie-du-jour": {
    field: FIELD.rose,
    art: plate(`
      <path d="M150 318c10-74 40-118 90-118s80 44 90 118Z" fill="#e9c48d"/>
      <path d="M168 318c8-56 30-90 72-90s64 34 72 90Z" fill="#f3d9ad"/>
      <path d="M186 318c6-38 22-62 54-62s48 24 54 62Z" fill="#fbeacb"/>
      <circle cx="240" cy="214" r="20" fill="#d2405c"/>
      <circle cx="196" cy="266" r="10" fill="#d2405c" opacity=".85"/>
      <circle cx="284" cy="266" r="10" fill="#d2405c" opacity=".85"/>
    `),
  },
  // a crescent with a real curl, not a beige lump
  "croissant-offert": {
    field: FIELD.sand,
    /* g translate, not new coordinates: the crescent floated a plate-rim above
       the surface in the last pass and read as hovering. */
    art: plate(`
      <g transform="translate(0 34)">
        <path d="M108 300c-8-70 44-128 116-128 66 0 116 46 122 106-22-46-64-72-116-70-56 2-96 38-110 92Z" fill="#c9873c"/>
        <path d="M124 296c-4-58 40-106 100-106 54 0 96 36 104 84-20-36-54-56-96-54-46 2-82 32-96 76Z" fill="#e0a755"/>
        <path d="M140 292c-2-46 34-84 84-84 44 0 78 28 86 66-18-28-46-42-80-40-38 2-68 26-80 58Z" fill="#efc07a"/>
        <path d="M186 210c10 16 14 34 12 52M240 190c4 18 4 36-2 52M292 206c-4 16-12 32-24 44"
              fill="none" stroke="#c9873c" stroke-width="6" stroke-linecap="round" opacity=".7"/>
      </g>
    `),
  },
  "brunch-complet": {
    field: FIELD.sky,
    art: plate(`
      <circle cx="192" cy="286" r="50" fill="#fdfaf2"/>
      <circle cx="192" cy="286" r="21" fill="${GOLD}"/>
      <rect x="256" y="242" width="90" height="30" rx="10" fill="#e0a755"/>
      <rect x="256" y="280" width="90" height="30" rx="10" fill="#c98b3f"/>
      <path d="M212 252c12-16 32-16 46 0" fill="none" stroke="${LEAF}" stroke-width="10" stroke-linecap="round"/>
      <circle cx="296" cy="228" r="12" fill="#d2405c"/>
    `),
  },
  "sandwich-offert": {
    field: FIELD.plum,
    art: plate(`
      <path d="M142 268c0-30 44-52 98-52s98 22 98 52Z" fill="#e6b46a"/>
      <rect x="142" y="266" width="196" height="18" rx="8" fill="#7fae62"/>
      <rect x="142" y="282" width="196" height="20" rx="8" fill="#d9736b"/>
      <rect x="142" y="300" width="196" height="14" rx="6" fill="#f0d99a"/>
      <path d="M142 312h196c0 24-44 38-98 38s-98-14-98-38Z" fill="#e6b46a"/>
      <circle cx="190" cy="238" r="5" fill="#c9873c"/><circle cx="240" cy="230" r="5" fill="#c9873c"/>
      <circle cx="290" cy="238" r="5" fill="#c9873c"/>
    `),
  },
};

/*
  NO FIELD. The art is transparent now, and that is the change that made the
  set stop looking like a sticker sheet.

  Each item used to carry its own baked-in pastel square — cream, rose, mint,
  sand — which was right when the app was one deep purple and the tiles needed
  telling apart. On the white app it is eight different backgrounds fighting the
  shop's own colour in a row four cards wide: a cappuccino on sand beside a
  pâtisserie on rose beside the shop's green. Nothing was wrong with any one of
  them and the row read as clipart.

  The field is CSS now (--cafe-soft), so every reward sits on a tint of the
  shop's own colour and the only other colours on the screen are the coffee and
  the croissant. One set, per shop, for free.

  `field` stays in ITEMS: it is still the source of each object's own palette
  choices, and dropping it would mean re-picking eight of them.
*/
const svg = (_field, art) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480" width="480" height="480">
  <!-- Each object was drawn to fill ~62% of its square, which was right when a
       coloured field surrounded it. With the field gone the same object reads as
       small and lost, so the whole set is scaled about its centre.

       1.12, not 1.2, and about a centre 12px BELOW the middle: every item is
       bottom-weighted (they all stand on a shadow ellipse around y=368), so
       scaling about the true centre pushed that shadow past y=480 and the
       rasteriser simply cut it off — cups with no saucer. -->
  <g transform="translate(240 228) scale(1.12) translate(-240 -228)">${art}</g>
</svg>`;

await mkdir(OUT, { recursive: true });
const made = [];
for (const [name, { field, art }] of Object.entries(ITEMS)) {
  /*
    TRIMMED, THEN RE-CENTRED — the step that makes the set line up.

    Every object was drawn bottom-weighted inside its square, because it used to
    sit on a coloured field where the empty space above it was part of the
    picture. Transparent, that empty space is just off-centre: in a 132×86 tile
    the app draws the WHOLE square, so the cup hangs low and the row looks
    misaligned even though every file is the same size.

    trim() cuts the transparent margin to the object's real bounding box, then
    contain-resize + extend puts it back in a square with an equal margin all
    round. Now every item is optically centred whatever box the app gives it.
  */
  const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
  const object = await sharp(Buffer.from(svg(field, art)))
    .trim({ threshold: 0 })
    .resize(SIZE - 72, SIZE - 72, { fit: "contain", background: CLEAR })
    .toBuffer();

  const buf = await sharp(object)
    .extend({ top: 36, bottom: 36, left: 36, right: 36, background: CLEAR })
    .png({ compressionLevel: 9, palette: true, colours: 96, dither: 0 })
    .toBuffer();
  const file = `${OUT}/${name}.png`;
  await writeFile(file, buf);
  made.push([file, buf.length]);
}

/* A contact sheet, so the whole set can be judged in one look rather than eight. */
const sheet = await sharp({
  create: { width: 4 * 240, height: 2 * 240, channels: 4, background: "#f6f6f8" },
})
  .composite(
    await Promise.all(
      Object.keys(ITEMS).map(async (name, i) => ({
        input: await sharp(`${OUT}/${name}.png`).resize(232, 232).toBuffer(),
        left: (i % 4) * 240 + 4,
        top: Math.floor(i / 4) * 240 + 4,
      })),
    ),
  )
  .png()
  .toBuffer();
await writeFile(`${OUT}/_sheet.png`, sheet);

for (const [f, n] of made) console.log(`${f.padEnd(42)} ${(n / 1024).toFixed(1)} KB`);
console.log(`\ncontact sheet → ${OUT}/_sheet.png`);
