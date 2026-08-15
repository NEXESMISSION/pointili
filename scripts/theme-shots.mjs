/**
 * THREE CARDS, ONE PRODUCT — the proof for the landing page's customisation
 * section.
 *
 *   node scripts/theme-shots.mjs
 *
 * The claim "the card is yours, not ours" is the hardest thing on the page to
 * believe, because every screenshot elsewhere shows ONE shop. So this shoots
 * the same screen three times with three different dresses — a colour, a
 * photograph, a flat mark — and the landing shows them side by side.
 *
 * It borrows the demo shop, sets a theme, films, and PUTS IT BACK. The restore
 * is in a finally: leaving Café El Manar wearing a test theme would break every
 * other asset on the page, which are all filmed from it.
 *
 * Output → public/demo/theme-a.png · theme-b.png · theme-c.png
 */
import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { env } from "./db.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOP = "cafe-el-manar";
const OUT = "public/demo";

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: biz } = await admin
  .from("businesses")
  .select("id, primary_color, design_settings, cover_url")
  .eq("slug", SHOP)
  .single();
if (!biz) throw new Error(`no ${SHOP} — run node scripts/demo.mjs first`);

const base = biz.design_settings;
const theme = (over) => ({ ...base, theme: { ...base.theme, ...over } });

async function cover() {
  const buf = await readFile("public/rewards/the-a-la-menthe.webp");
  const webp = await sharp(buf)
    .resize(640, 380, { fit: "cover", position: "centre" })
    .webp({ quality: 82 })
    .toBuffer();
  return `data:image/webp;base64,${webp.toString("base64")}`;
}

/* Three shops that could not be mistaken for each other — which is the point. */
const LOOKS = [
  {
    file: "theme-a",
    colour: "#1d4ed8",
    design: theme({ banner: "gradient", pattern: "dots", bannerRound: "l", bannerHeight: "l", font: "poppins" }),
  },
  {
    file: "theme-b",
    colour: "#7a4a25",
    design: theme({ banner: "photo", pattern: "none", bannerRound: "m", bannerHeight: "l", scrim: true, font: "poppins", coverAt: "themeshot" }),
  },
  {
    file: "theme-c",
    colour: "#0f6b52",
    design: theme({ banner: "flat", pattern: "stripes", bannerRound: "none", bannerHeight: "m", font: "inter" }),
  },
];

/* The shoot's own customer — a real card is the only honest screenshot. */
const NUM = `2${String(Date.now()).slice(-7)}`;
const NORM = `+216${NUM}`;
const PIN = "4271";

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 780 },
  deviceScaleFactor: 2, // retina, or these look soft beside the filmed clips
});
/* Next's dev-tools badge floats over the top-right of every page — exactly
   where the card's profile control is. addInitScript, not addStyleTag: a style
   added to one document is gone the moment the page navigates. */
await ctx.addInitScript((css) => {
  const put = () => {
    const st = document.createElement("style");
    st.textContent = css;
    document.head?.appendChild(st);
  };
  if (document.head) put();
  else document.addEventListener("DOMContentLoaded", put);
}, `nextjs-portal, #__next-build-watcher, [data-nextjs-toast],
    [data-nextjs-dev-tools-button], #__next-dev-tools-indicator { display: none !important }`);
const page = await ctx.newPage();

try {
  await page.goto(`${BASE}/${SHOP}/rejoindre`, { waitUntil: "networkidle" });
  await page.fill('input[name="phone"]', NUM);
  await page.fill('input[name="pin"]', PIN);
  await page.fill('input[name="name"]', "Yassine");
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/${SHOP}`, { timeout: 25000 });

  /* A balance worth photographing, then one visit to spend the "you unlocked
     something" overlay — it is correct behaviour and it covers the card. */
  await admin.rpc("credit_points", { p_business_id: biz.id, p_phone: NORM, p_amount_tnd: 195 });
  await page.goto(`${BASE}/${SHOP}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const coverUri = await cover();
  for (const look of LOOKS) {
    await admin
      .from("businesses")
      .update({
        primary_color: look.colour,
        design_settings: look.design,
        ...(look.design.theme.banner === "photo" ? { cover_url: coverUri } : {}),
      })
      .eq("id", biz.id);

    await page.goto(`${BASE}/${SHOP}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/${look.file}.png` });
    console.log(`  ✓ ${OUT}/${look.file}.png  ${look.colour}`);
  }
} finally {
  /* PUT THE SHOP BACK. Every other asset on the landing page is filmed here. */
  await admin
    .from("businesses")
    .update({
      primary_color: biz.primary_color,
      design_settings: base,
      cover_url: biz.cover_url,
    })
    .eq("id", biz.id);
  await browser.close();

  for (const t of ["loyalty_redemptions", "stamp_rewards", "loyalty_stamps"]) {
    await admin.from(t).delete().eq("phone", NORM);
  }
  await admin.from("points_ledger").delete().eq("customer_phone", NORM);
  await admin.from("diner_cafes").delete().eq("phone", NORM);
  await admin.from("accounts").delete().eq("phone", NORM);
  console.log("shop restored, shoot customer removed");
}
