/**
 * Screenshot the running dev server using the system Chrome.
 *
 * The in-app browser pane renders with visibilityState "hidden", which breaks
 * screenshots (and rAF, and lazy-loading). This drives real Chrome instead so
 * the UI can actually be looked at.
 *
 *   node scripts/shot.mjs /saif /saif/jeux /owner
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "scratch/shots";

const paths = process.argv.slice(2);
if (!paths.length) paths.push("/");

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  storageState: process.env.STORAGE ?? undefined,
});
const page = await ctx.newPage();

for (const p of paths) {
  const name = (p === "/" ? "landing" : p.replace(/\//g, "_").replace(/^_/, ""))
    .replace(/[^a-z0-9_-]/gi, "");
  await page.goto(BASE + p, { waitUntil: "networkidle" });
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`${p.padEnd(22)} -> ${file}`);
}

if (process.env.SAVE_STORAGE) {
  await ctx.storageState({ path: process.env.SAVE_STORAGE });
}

await browser.close();
