/**
 * Sign a diner in, then screenshot the hub screens.
 *   node scripts/shot-diner.mjs
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "scratch/shots";
const SLUG = process.env.SLUG ?? "saif";
const PHONE = process.env.PHONE ?? "20 123 456";
const PIN = process.env.PIN ?? "4271";

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

await page.goto(`${BASE}/${SLUG}/rejoindre`, { waitUntil: "networkidle" });
if (page.url().includes("rejoindre")) {
  await page.fill('input[name="phone"]', PHONE);
  await page.fill('input[name="pin"]', PIN);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/${SLUG}`, { timeout: 15000 }).catch(() => {});
}
console.log("signed in ->", page.url());

for (const p of [`/${SLUG}`, `/${SLUG}/jeux`, `/${SLUG}/boutique`]) {
  await page.goto(BASE + p, { waitUntil: "networkidle" });
  const name = p.replace(/\//g, "_").replace(/^_/, "");
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`${p.padEnd(18)} -> ${OUT}/${name}.png`);
}

await browser.close();
