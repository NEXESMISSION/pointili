/**
 * Reward photography — real food, not drawings.
 *
 *   node scripts/reward-photos.mjs candidates   → download options, build sheets
 *   node scripts/reward-photos.mjs build        → cut the chosen ones to size
 *
 * WHY PHOTOS AND WHY THESE ONES. The drawn set (reward-art.mjs) reads as icons,
 * and a loyalty card that shows an icon of a croissant next to "Croissant
 * offert" is telling you something you already read. A photograph of the thing
 * is the reason anybody looks at the screen twice.
 *
 * SOURCE AND LICENCE, on purpose: Openverse, filtered to CC0 ONLY. CC0 is a
 * public-domain dedication — commercial use, no attribution obligation, no
 * share-alike. Anything CC BY or BY-SA would put an attribution requirement
 * into a shop's loyalty card, which is not a thing we can ask an owner to
 * carry. Every file's origin is written to public/rewards/CREDITS.json even so:
 * the licence does not require it, and being able to answer "where did this
 * come from" a year from now does.
 *
 * The candidates step exists because a search API cannot be trusted to pick:
 * the top "espresso" result is a MacBook on a table with a cup beside it. The
 * sheets get looked at, the indices go in CHOSEN, and only then are the files
 * built.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import sharp from "sharp";

const OUT = "public/rewards";
const WORK = "scratch/photos";
const SIZE = 640; // square, retina-comfortable at the 132px and 56px it renders

/** file base → what to search for. English terms: the corpus is English-tagged. */
const ITEMS = {
  "espresso-offert": "espresso coffee cup",
  "cappuccino-offert": "cappuccino latte art",
  "the-a-la-menthe": "mint tea glass",
  "jus-dorange": "orange juice glass",
  "patisserie-du-jour": "pastry cake slice plate",
  "croissant-offert": "croissant",
  "sandwich-offert": "sandwich",
  "brunch-complet": "brunch breakfast plate",
};

/** Filled in after looking at the contact sheets. base → candidate index. */
const CHOSEN = JSON.parse(process.env.CHOSEN ?? "{}");

const CANDIDATES = 6;

async function search(q) {
  const u = new URL("https://api.openverse.org/v1/images/");
  u.searchParams.set("q", q);
  u.searchParams.set("license", "cc0");
  u.searchParams.set("page_size", String(CANDIDATES * 2));
  /* Photographs only — the corpus is full of vector clipart under the same
     licence, which is the thing we are moving away from. */
  u.searchParams.set("category", "photograph");
  u.searchParams.set("aspect_ratio", "square,wide");
  const r = await fetch(u, { headers: { "User-Agent": "pointili-dev" } });
  if (!r.ok) throw new Error(`openverse ${r.status} for ${q}`);
  const j = await r.json();
  return (j.results ?? []).filter((x) => x.license === "cc0");
}

async function grab(url) {
  const r = await fetch(url, { headers: { "User-Agent": "pointili-dev" } });
  if (!r.ok) throw new Error(`fetch ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Square, centre-of-attention crop — sharp picks the busiest region. */
const square = (buf, size) =>
  sharp(buf).resize(size, size, { fit: "cover", position: sharp.strategy.attention });

if (process.argv[2] === "candidates") {
  await mkdir(WORK, { recursive: true });
  const index = {};

  for (const [base, q] of Object.entries(ITEMS)) {
    const hits = (await search(q)).slice(0, CANDIDATES);
    index[base] = [];
    const tiles = [];

    for (let i = 0; i < hits.length; i++) {
      try {
        const buf = await grab(hits[i].url);
        tiles.push({ input: await square(buf, 220).png().toBuffer(), left: i * 228 + 4, top: 4 });
        index[base].push({
          i,
          title: hits[i].title,
          creator: hits[i].creator ?? null,
          source: hits[i].foreign_landing_url ?? hits[i].url,
          url: hits[i].url,
          license: hits[i].license,
        });
      } catch {
        /* a dead link in the corpus — skip it, the sheet just has one fewer */
      }
    }

    if (!tiles.length) continue;
    const sheet = await sharp({
      create: { width: 228 * tiles.length + 8, height: 228, channels: 4, background: "#ffffff" },
    })
      .composite(tiles)
      .png()
      .toBuffer();
    await writeFile(`${WORK}/${base}.png`, sheet);
    console.log(`${base}: ${tiles.length} candidates`);
  }

  await writeFile(`${WORK}/index.json`, JSON.stringify(index, null, 2));
  console.log(`\nsheets → ${WORK}/  (numbered left to right from 0)`);
}

if (process.argv[2] === "build") {
  const index = JSON.parse(await readFile(`${WORK}/index.json`, "utf8"));
  const credits = {};

  for (const [base, pick] of Object.entries(CHOSEN)) {
    const meta = index[base].find((c) => c.i === pick);
    if (!meta) throw new Error(`no candidate ${pick} for ${base}`);
    const buf = await grab(meta.url);

    /* WebP at 76: these sit at 132px and 56px on a phone, so the ceiling is
       what a slow connection will carry, not what a monitor can show. Each one
       lands around 20-30 KB against 200+ for the same photo as JPEG. */
    const out = await square(buf, SIZE).webp({ quality: 76, effort: 5 }).toBuffer();
    await writeFile(`${OUT}/${base}.webp`, out);
    credits[`${base}.webp`] = {
      title: meta.title,
      creator: meta.creator,
      source: meta.source,
      license: "CC0 1.0 (public domain dedication)",
    };
    console.log(`${base}.webp`.padEnd(28), `${(out.length / 1024).toFixed(1)} KB`);
  }

  await writeFile(`${OUT}/CREDITS.json`, JSON.stringify(credits, null, 2));
  console.log(`\ncredits → ${OUT}/CREDITS.json`);
}
