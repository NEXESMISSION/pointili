/**
 * Film the REAL app for the landing page.
 *
 *   node scripts/capture.mjs
 *
 * Not a re-creation. Playwright drives the actual product against the demo café
 * (35 customers, ~90 days of history) and records what happens, so every pixel
 * on the marketing page is the software doing the thing it claims to do. A
 * hand-built imitation is both more work and weaker proof — it can drift, and a
 * visitor has no way to know it is not a mock-up.
 *
 * WEBM, NOT GIF. A GIF of a phone screen is 1–3 MB, capped at 256 colours, and
 * looks like a fax of the product. The same clip as webm is ~150 KB, full
 * colour, and plays inline with <video autoplay muted loop playsinline>. On
 * Tunisian 4G that difference decides whether the page loads at all.
 *
 * One browser CONTEXT per clip: Playwright writes the video when the context
 * closes, so a context per clip is what produces a file per clip.
 *
 * Output → public/demo/
 */
import { chromium } from "playwright-core";
import { mkdir, rename, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { env } from "./db.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "public/demo";
const TMP = "scratch/capture-tmp";

const OWNER = { email: "elmanar@pointili.online", password: process.env.DEMO_PASSWORD ?? "ElManar2026" };
const SHOP = "cafe-el-manar";
/* Real cardholders of the demo café — filming against invented ones would put
   names on the landing page that do not exist in the product. */
const CUSTOMER = { code: "844Y", name: "Yassine" };

const PHONE = { width: 390, height: 844 };

await mkdir(OUT, { recursive: true });
await rm(TMP, { recursive: true, force: true });
await mkdir(TMP, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
const done = [];

/*
  Next's dev indicator is a floating badge in the bottom-right corner. In a
  screenshot it sits on top of the nav — it was covering "Réglages" — and in a
  video it is in every single frame of a marketing asset. Hidden on every page
  of every capture context.
*/
const HIDE_DEV_BADGE = `
  nextjs-portal, #__next-build-watcher, [data-nextjs-toast],
  [data-nextjs-dev-tools-button], #__next-dev-tools-indicator { display: none !important; }
`;

async function dressed(ctx) {
  await ctx.addInitScript((css) => {
    const put = () => {
      const st = document.createElement("style");
      st.textContent = css;
      document.head?.appendChild(st);
    };
    if (document.head) put();
    else document.addEventListener("DOMContentLoaded", put);
  }, HIDE_DEV_BADGE);
  return ctx;
}

/** A context that records video, at phone size. */
async function filming() {
  return dressed(
    await browser.newContext({
      viewport: PHONE,
      recordVideo: { dir: TMP, size: PHONE },
    }),
  );
}

/** Close the context and move its single video to a stable name. */
async function save(ctx, name) {
  await ctx.close(); // flushes the .webm
  const files = (await readdir(TMP)).filter((f) => f.endsWith(".webm"));
  if (!files.length) { console.log(`  ${name}: no video written`); return; }
  const newest = files.map((f) => `${TMP}/${f}`).sort().pop();
  await rename(newest, `${OUT}/${name}.webm`);
  done.push(`${name}.webm`);
  console.log(`  ✓ ${OUT}/${name}.webm`);
}

async function signIn(page) {
  await page.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
  if (page.url().includes("/login")) {
    await page.fill('input[name="email"]', OWNER.email);
    await page.fill('input[name="password"]', OWNER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 }).catch(() => {});
  }
  return !page.url().includes("/login");
}

/** Type like a person, so the clip does not look like a script. */
async function human(page, selector, text, delay = 110) {
  await page.click(selector);
  for (const ch of text) {
    await page.type(selector, ch, { delay: 0 });
    await page.waitForTimeout(delay);
  }
}

const beat = (page, ms = 900) => page.waitForTimeout(ms);

/* ── 1 · CREDIT: the five seconds a cashier actually spends ───────────── */
console.log("filming: crédit au comptoir");
{
  const ctx = await filming();
  const page = await ctx.newPage();
  if (await signIn(page)) {
    await page.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
    await page.locator('input[name="customer"]').waitFor({ timeout: 20000 }).catch(() => {});
    await beat(page, 700);
    await human(page, 'input[name="customer"]', CUSTOMER.code, 160);
    await beat(page, 400);
    await page.locator('button:has-text("Chercher")').click().catch(() => {});
    await page.locator('[role="dialog"]').waitFor({ timeout: 20000 }).catch(() => {});
    await beat(page, 800);
    await human(page, 'input[name="amount"]', "12", 180);
    await beat(page, 500);
    await page.locator('button:has-text("Créditer")').click().catch(() => {});
    await beat(page, 3200); // let the confirmation play out
  }
  await save(ctx, "credit");
}

/* ── 2 · STAMP ─────────────────────────────────────────────────────────── */
console.log("filming: +1 tampon");
{
  const ctx = await filming();
  const page = await ctx.newPage();
  if (await signIn(page)) {
    await page.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
    await page.locator('input[name="customer"]').waitFor({ timeout: 20000 }).catch(() => {});
    await human(page, 'input[name="customer"]', CUSTOMER.code, 150);
    await page.locator('button:has-text("Chercher")').click().catch(() => {});
    await page.locator('[role="dialog"]').waitFor({ timeout: 20000 }).catch(() => {});
    await beat(page, 900);
    const stamp = page.locator('button:has-text("tampon")').first();
    if (await stamp.count()) {
      await stamp.click();
      await beat(page, 3000);
    } else {
      console.log("  (stamps are off for this café — clip skipped)");
    }
  }
  await save(ctx, "stamp");
}

/* ── 3 · ANALYSES: the screen that answers "do they come back?" ───────── */
console.log("filming: analyses");
{
  const ctx = await filming();
  const page = await ctx.newPage();
  if (await signIn(page)) {
    await page.goto(`${BASE}/owner/analyses`, { waitUntil: "networkidle" });
    await beat(page, 1600);
    // scroll the whole report slowly, so the clip shows what is actually there
    await page.mouse.wheel(0, 400); await beat(page, 1100);
    await page.mouse.wheel(0, 400); await beat(page, 1100);
    await page.mouse.wheel(0, 400); await beat(page, 1400);
  }
  await save(ctx, "analyses");
}

/* ── 4 · RÉGLAGES: changing the programme ──────────────────────────────── */
console.log("filming: réglages");
{
  const ctx = await filming();
  const page = await ctx.newPage();
  if (await signIn(page)) {
    await page.goto(`${BASE}/owner/reglages`, { waitUntil: "networkidle" });
    await beat(page, 1300);
    const row = page.locator('button:has-text("Les points")').first();
    if (await row.count()) { await row.click(); await beat(page, 2200); }
    else { await page.mouse.wheel(0, 500); await beat(page, 1600); }
  }
  await save(ctx, "reglages");
}

/* ── 5 · QR: the kit a shop prints ─────────────────────────────────────── */
console.log("filming: kit QR");
{
  const ctx = await filming();
  const page = await ctx.newPage();
  if (await signIn(page)) {
    await page.goto(`${BASE}/owner/qr`, { waitUntil: "networkidle" });
    await beat(page, 1600);
    await page.mouse.wheel(0, 420); await beat(page, 1500);
  }
  await save(ctx, "qr");
}

/* ── 6 · THE CUSTOMER'S CARD ───────────────────────────────────────────── */
console.log("filming: la carte du client");
{
  const ctx = await filming();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${SHOP}`, { waitUntil: "networkidle" });
  await beat(page, 1500);
  await page.mouse.wheel(0, 420); await beat(page, 1500);
  await save(ctx, "carte");
}

/* ── 7 · SIGNUP: scan → carte, the "no app, no e-mail" proof ──────────── */
console.log("filming: inscription");
const NEWPHONE = `2${String(Date.now()).slice(-7)}`;
{
  const ctx = await filming();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${SHOP}/rejoindre`, { waitUntil: "networkidle" });
  await beat(page, 1100);
  await human(page, 'input[name="phone"]', NEWPHONE, 120);
  await beat(page, 300);
  await human(page, 'input[name="pin"]', "4271", 200);
  await beat(page, 300);
  await human(page, 'input[name="name"]', "Karim", 130);
  await beat(page, 500);
  await page.click('button[type="submit"]').catch(() => {});
  await page.waitForURL(`**/${SHOP}`, { timeout: 25000 }).catch(() => {});
  await beat(page, 3000); // the card arriving, welcome bonus and all
  await save(ctx, "signup");
}

/* ── 8 · REDEEM: the customer spends points and gets a code ───────────── */
console.log("filming: échange d'une récompense");
{
  const ctx = await filming();
  const page = await ctx.newPage();
  // sign in as the customer we just made, then top them up so a reward is affordable
  await page.goto(`${BASE}/moi`, { waitUntil: "networkidle" });
  await page.fill('input[name="phone"]', NEWPHONE).catch(() => {});
  await page.fill('input[name="pin"]', "4271").catch(() => {});
  await page.click('button[type="submit"]').catch(() => {});
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/${SHOP}/boutique`, { waitUntil: "networkidle" });
  await beat(page, 1500);
  const buy = page.locator('form button[type="submit"]').first();
  if (await buy.count() && await buy.isEnabled().catch(() => false)) {
    await buy.click();
    await beat(page, 3200); // the code panel
  } else {
    await page.mouse.wheel(0, 300);
    await beat(page, 1800);
    console.log("  (not enough points to buy — showing the ladder instead)");
  }
  await save(ctx, "redeem");
}

/* ── 9 · CORRECTION + HISTORIQUE: "and if my cashier gets it wrong?" ──── */
console.log("filming: correction et historique");
{
  const ctx = await filming();
  const page = await ctx.newPage();
  if (await signIn(page)) {
    await page.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
    await page.locator('input[name="customer"]').waitFor({ timeout: 20000 }).catch(() => {});
    await human(page, 'input[name="customer"]', CUSTOMER.code, 150);
    await page.locator('button:has-text("Chercher")').click().catch(() => {});
    await page.locator('[role="dialog"]').waitFor({ timeout: 20000 }).catch(() => {});
    await beat(page, 900);
    const more = page.locator('button:has-text("Corriger")').first();
    if (await more.count()) {
      await more.click();
      await beat(page, 1800); // the history list, with every line that ever landed
      await page.mouse.wheel(0, 260);
      await beat(page, 1800);
    }
  }
  await save(ctx, "correction");
}

/* ── 10 · THE WALLET: one code, every shop ────────────────────────────── */
console.log("filming: le portefeuille");
{
  const ctx = await filming();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/moi`, { waitUntil: "networkidle" });
  await page.fill('input[name="phone"]', NEWPHONE).catch(() => {});
  await page.fill('input[name="pin"]', "4271").catch(() => {});
  await page.click('button[type="submit"]').catch(() => {});
  await page.waitForTimeout(2600);
  await beat(page, 1800); // the wallet, with its staggered arrival
  await page.mouse.wheel(0, 300);
  await beat(page, 1500);
  await save(ctx, "wallet");
}

/* ── stills, for anything better read than watched ─────────────────────── */
console.log("stills");
{
  const ctx = await dressed(await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 }));
  const page = await ctx.newPage();
  if (await signIn(page)) {
    for (const [path, name] of [
      ["/owner", "till"],
      ["/owner/analyses", "analyses"],
      ["/owner/reglages", "reglages"],
      ["/owner/qr", "qr"],
    ]) {
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      done.push(`${name}.png`);
      console.log(`  ✓ ${OUT}/${name}.png`);
    }
  }
  await ctx.close();
}

await browser.close();
await rm(TMP, { recursive: true, force: true });

/*
  Remove the customer created for the shoot. These captures run against the REAL
  database — leaving "Karim" and his points behind would quietly inflate the demo
  café's own analytics, which are the numbers the landing page then shows.
*/
{
  const { createClient } = await import("@supabase/supabase-js");
  const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const norm = `+216${NEWPHONE}`;
  for (const t of ["loyalty_redemptions", "stamp_rewards", "loyalty_stamps"]) {
    await svc.from(t).delete().eq("phone", norm);
  }
  await svc.from("points_ledger").delete().eq("customer_phone", norm);
  await svc.from("diner_cafes").delete().eq("phone", norm);
  await svc.from("pin_attempts").delete().eq("phone", norm);
  await svc.from("accounts").delete().eq("phone", norm);
  console.log("cleaned up the shoot's test customer");
}

console.log(`\n${done.length} assets in ${OUT}/`);
if (!existsSync(`${OUT}/credit.webm`)) {
  console.log("WARNING: credit.webm missing — the till clip is the important one.");
  process.exit(1);
}
