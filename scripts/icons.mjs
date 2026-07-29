/**
 * Every icon Pointili shows the world, generated from one source.
 *
 *   node scripts/icons.mjs
 *
 * Run it again whenever public/brand-mark.png changes. Committing the output is
 * deliberate: these are build inputs for Next's metadata routes and for the
 * manifest, and generating them at build time would put sharp on the critical
 * path of every deploy for files that change twice a year.
 *
 * WHY THIS EXISTS. app/icon.png and app/apple-icon.png were the same 982×983,
 * 160 KB file — shipped to a browser tab that renders it at 16px, and to iOS
 * which wants 180. favicon.ico was 25 KB. There was no maskable icon, so an
 * Android launcher had to guess how to crop a square, and no manifest at all,
 * so nothing was installable.
 *
 * The surfaces this feeds, all of which the user asked about:
 *   - the browser tab            → app/icon.png + app/favicon.ico
 *   - the Google result favicon  → favicon.ico (Google wants ≥48px, square)
 *   - the Android home screen    → manifest icons, incl. a MASKABLE one
 *   - the iOS home screen        → app/apple-icon.png (180, no transparency)
 *   - a pasted link's big image  → app/opengraph-image.tsx (drawn, not here)
 */
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const SRC = "public/brand-mark.png";

/**
 * Apple ignores alpha and composites over black, so a transparent icon arrives
 * with black corners. Everything here is flattened onto the mark's own paper
 * colour instead.
 */
const PAPER = { r: 248, g: 247, b: 252, alpha: 1 };

/**
 * The mark, centred on paper, at a given share of the width.
 *
 * Always a COMPOSITE, never a resize-with-background. The source is the
 * transparent mark (public/brand-mark.png), so every icon is the same artwork
 * on the same uniform field — the first version of this script letterboxed a
 * mark that already carried its own near-white background, and the two
 * near-whites differed by three points of grey, which drew a visible square box
 * inside every icon.
 */
async function tile(size, share, { palette = true } = {}) {
  const inner = Math.round(size * share);
  const mark = await sharp(SRC).resize(inner, inner, { fit: "inside" }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: PAPER } })
    .composite([{ input: mark, gravity: "centre" }])
    .flatten({ background: PAPER })
    /* palette + dithering off: the mark is a flat two-tone gradient, so an
       indexed PNG is a quarter of the size with no visible difference at any
       of these sizes. */
    .png(palette ? { compressionLevel: 9, palette: true, colours: 128, dither: 0 } : { compressionLevel: 9 })
    .toBuffer();
}

/** The tab / iOS / Google size: generous, but not touching the edges. */
const square = (size, opts) => tile(size, 0.76, opts);

/**
 * A MASKABLE icon is not just "an icon" — Android crops it to whatever shape
 * the launcher likes (circle, squircle, teardrop), and only the inner 80% is
 * guaranteed to survive. So the mark is inset to 62% and the paper runs to all
 * four edges: any crop lands on paper, never through the artwork.
 */
const maskable = (size) => tile(size, 0.56);

/**
 * A real multi-size .ico, written by hand — sharp cannot emit one and it is not
 * worth a dependency.
 *
 * Modern .ico files may embed PNG data directly rather than a BMP, which is
 * what makes this ~40 lines instead of a codec. Layout: a 6-byte ICONDIR, then
 * one 16-byte ICONDIRENTRY per size, then the PNG blobs.
 *
 * 16/32/48 on purpose: 16 and 32 are the tab, and Google's crawler wants at
 * least 48 and a square, or it falls back to a generic globe in the results.
 */
async function ico(sizes) {
  /*
    RGBA, not indexed. Next's build decodes favicon.ico to emit its <link> tags
    and its ICO reader rejects a palette PNG outright — "The PNG is not in RGBA
    format!" — which fails the whole build. These three are tiny either way.
  */
  const pngs = await Promise.all(sizes.map((s) => square(s, { palette: false })));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(sizes.length, 4);

  let offset = 6 + 16 * sizes.length;
  const dir = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s >= 256 ? 0 : s, 0); // 0 means 256
    e.writeUInt8(s >= 256 ? 0 : s, 1);
    e.writeUInt8(0, 2); // palette size — 0 for PNG
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });

  return Buffer.concat([header, ...dir, ...pngs]);
}

const kb = (b) => `${(b.length / 1024).toFixed(1)} KB`;

const src = await readFile(SRC);
const meta = await sharp(src).metadata();
console.log(`source ${SRC} — ${meta.width}×${meta.height}, ${kb(src)}\n`);

const out = [
  // Next metadata routes: it emits the <link rel> tags from these filenames.
  ["app/icon.png", await square(512)],
  ["app/apple-icon.png", await square(180)],
  ["app/favicon.ico", await ico([16, 32, 48])],
  // referenced by app/manifest.ts
  ["public/icon-192.png", await square(192)],
  ["public/icon-512.png", await square(512)],
  ["public/icon-maskable-512.png", await maskable(512)],
];

for (const [path, buf] of out) {
  await writeFile(path, buf);
  console.log(`${path.padEnd(32)} ${kb(buf).padStart(9)}`);
}
