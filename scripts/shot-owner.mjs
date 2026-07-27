/**
 * Sign the owner in (real Supabase Auth) and screenshot the owner app.
 *   node scripts/shot-owner.mjs /owner /owner/caisse
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { env } from "./db.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";

/*
  Two hosts now. The customer side keeps the apex (every printed QR points at it)
  and the business side lives on app.* — Chrome resolves app.localhost without a
  hosts-file entry, so this exercises the real split rather than a special case.
  Paths are real on both hosts: the till is /owner.
*/
const APP = process.env.APP_URL ?? BASE.replace("//", "//app.");
const OUT = "scratch/shots";
const EMAIL = process.env.OWNER_EMAIL ?? env.SUPER_ADMIN_EMAIL;
const PASSWORD = process.env.OWNER_PASSWORD ?? env.SUPER_ADMIN_PASSWORD;

const paths = process.argv.slice(2);
if (!paths.length) paths.push("/owner");

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

await page.goto(`${APP}/owner/login`, { waitUntil: "networkidle" });
if (page.url().includes("/login")) {
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});
}
console.log("signed in ->", page.url().replace(BASE, ""));

for (const p of paths) {
  await page.goto(BASE + p, { waitUntil: "networkidle" });
  const name = "own" + p.replace(/\//g, "_");
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`${p.padEnd(18)} -> ${OUT}/${name}.png`);
}
await browser.close();
