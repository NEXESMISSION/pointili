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
 * looks like a fax of the product. The same clip as webm is ~50–500 KB, full
 * colour, and plays inline with <video autoplay muted loop playsinline>. On
 * Tunisian 4G that difference decides whether the page loads at all.
 *
 * ONE CONTEXT PER AUDIENCE, ONE PAGE PER CLIP.
 *
 * Playwright writes one video per PAGE, so a single context can produce many
 * clips. That matters here for a reason that cost a whole run: Supabase rotates
 * the refresh token every time it is used, so a saved storageState replayed into
 * six separate contexts is spent after the first — every later clip silently
 * filmed the LOGIN SCREEN instead of the till, at a convincing 44 KB apiece.
 * One live session, many pages, no replay.
 *
 * Output → public/demo/
 */
import { chromium } from "playwright-core";
import { mkdir, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { env } from "./db.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "public/demo";
const TMP = "scratch/capture-tmp";

const OWNER = { email: "elmanar@pointili.online", password: process.env.DEMO_PASSWORD ?? "ElManar2026" };
const SHOP = "cafe-el-manar";
/* A real cardholder of the demo café — filming against an invented one would put
   a name on the landing page that does not exist in the product. */
const CUSTOMER = { code: "844Y", name: "Yassine" };

const PHONE = { width: 390, height: 844 };

await mkdir(OUT, { recursive: true });
await rm(TMP, { recursive: true, force: true });
await mkdir(TMP, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });

/*
  Next's dev indicator is a floating badge in the bottom-right corner. In a
  screenshot it sits on top of the nav — it was covering "Réglages" — and in a
  video it is in every single frame of a marketing asset.
*/
const HIDE_DEV_BADGE = `
  nextjs-portal, #__next-build-watcher, [data-nextjs-toast],
  [data-nextjs-dev-tools-button], #__next-dev-tools-indicator { display: none !important; }
`;

async function context({ record = true, retina = false } = {}) {
  const ctx = await browser.newContext({
    viewport: PHONE,
    ...(retina ? { deviceScaleFactor: 2 } : {}),
    ...(record ? { recordVideo: { dir: TMP, size: PHONE } } : {}),
  });
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

/** name → the temp video path, resolved once its context has closed. */
const pending = [];

/**
 * Film one clip on its own PAGE inside a shared context.
 *
 * Also grabs a poster from the LAST frame of the flow: a <video> that has not
 * started shows its poster, and with none it shows black. Autoplay is not a
 * guarantee — data-saver, low-power mode and reduced-motion all suppress it. The
 * end of the flow is the right frame to freeze on: the confirmation, the code,
 * the filled card, rather than the empty form it opened on.
 */
async function clip(ctx, name, flow) {
  console.log(`filming: ${name}`);
  const page = await ctx.newPage();
  try {
    await flow(page);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  } catch (e) {
    console.log(`  ! ${name}: ${String(e.message).split("\n")[0].slice(0, 90)}`);
  }
  const video = page.video();
  await page.close(); // finalises this page's own video
  if (video) pending.push([await video.path(), name]);
}

/** Type like a person, so the clip does not look like a script. */
async function human(page, selector, text, delay = 130) {
  await page.click(selector);
  for (const ch of text) {
    await page.type(selector, ch, { delay: 0 });
    await page.waitForTimeout(delay);
  }
}

const beat = (page, ms = 900) => page.waitForTimeout(ms);

/** Open the till and identify our demo customer. Shared by three clips. */
async function openCustomer(page) {
  await page.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
  await page.locator('input[name="customer"]').waitFor({ timeout: 20000 });
  await beat(page, 700);
  await human(page, 'input[name="customer"]', CUSTOMER.code, 160);
  await beat(page, 350);
  await page.locator('button:has-text("Chercher")').click();
  await page.locator('[role="dialog"]').waitFor({ timeout: 20000 });
  await beat(page, 700);
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  THE OWNER — one signed-in context, one page per clip                  */
/* ══════════════════════════════════════════════════════════════════════ */

const owner = await context();
{
  const page = await owner.newPage();
  /*
    networkidle, NOT domcontentloaded. The form posts through a React server
    action, so filling and clicking before hydration types into a live input and
    presses a button wired to nothing — the click "succeeds", the page never
    navigates, and the whole shoot runs on with no session.
  */
  await page.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
  if (page.url().includes("/login")) {
    await page.fill('input[name="email"]', OWNER.email);
    await page.fill('input[name="password"]', OWNER.password);
    await page.locator('button[type="submit"]').click({ timeout: 25000 }).catch(() => {});
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 }).catch(() => {});
  }
  if (page.url().includes("/login")) {
    const said = await page.locator('[role="alert"]').innerText().catch(() => "");
    console.error(`could not sign in as ${OWNER.email} — nothing to film. ${said}`);
    console.error("If the password changed: DEMO_PASSWORD=… node scripts/capture.mjs");
    process.exit(1);
  }
  console.log("signed in — every owner clip shares this session\n");
  await page.close(); // its video is the login itself; not wanted
}

await clip(owner, "credit", async (page) => {
  await openCustomer(page);
  await human(page, 'input[name="amount"]', "12", 190);
  await beat(page, 450);
  await page.locator('button:has-text("Créditer")').click();
  await beat(page, 3400); // let the confirmation play out
});

await clip(owner, "stamp", async (page) => {
  await openCustomer(page);
  const stamp = page.locator('button:has-text("tampon")').first();
  if (!(await stamp.count())) throw new Error("stamps are off for this café");
  await stamp.click();
  await beat(page, 3200);
});

await clip(owner, "analyses", async (page) => {
  await page.goto(`${BASE}/owner/analyses`, { waitUntil: "networkidle" });
  await beat(page, 1700);
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 380); await beat(page, 1200); }
});

await clip(owner, "reglages", async (page) => {
  await page.goto(`${BASE}/owner/reglages`, { waitUntil: "networkidle" });
  await beat(page, 1400);
  const row = page.locator('button:has-text("Les points")').first();
  if (await row.count()) { await row.click(); await beat(page, 2400); }
  else { await page.mouse.wheel(0, 480); await beat(page, 1700); }
});

await clip(owner, "qr", async (page) => {
  await page.goto(`${BASE}/owner/qr`, { waitUntil: "networkidle" });
  await beat(page, 1700);
  await page.mouse.wheel(0, 420);
  await beat(page, 1600);
});

await clip(owner, "correction", async (page) => {
  await openCustomer(page);
  const more = page.locator('button:has-text("Corriger")').first();
  if (!(await more.count())) throw new Error("no correction control on the sheet");
  await more.click();
  await beat(page, 1900); // the history, every line that ever landed
  await page.mouse.wheel(0, 240);
  await beat(page, 1900);
});

/* retina stills, in the SAME live session */
{
  const page = await owner.newPage();
  for (const [path, name] of [["/owner", "till"]]) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log(`  ✓ ${OUT}/${name}.png`);
  }
  await page.close();
}

await owner.close(); // flushes every page's video

/* ══════════════════════════════════════════════════════════════════════ */
/*  THE CUSTOMER — signed out, then their own session                     */
/* ══════════════════════════════════════════════════════════════════════ */

const NEWPHONE = `2${String(Date.now()).slice(-7)}`;
const PIN = "4271";

const guest = await context();

await clip(guest, "carte", async (page) => {
  await page.goto(`${BASE}/${SHOP}`, { waitUntil: "networkidle" });
  await beat(page, 1600);
  await page.mouse.wheel(0, 420);
  await beat(page, 1600);
});

await clip(guest, "signup", async (page) => {
  await page.goto(`${BASE}/${SHOP}/rejoindre`, { waitUntil: "networkidle" });
  await beat(page, 1100);
  await human(page, 'input[name="phone"]', NEWPHONE, 120);
  await beat(page, 250);
  await human(page, 'input[name="pin"]', PIN, 210);
  await beat(page, 250);
  await human(page, 'input[name="name"]', "Karim", 140);
  await beat(page, 450);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/${SHOP}`, { timeout: 25000 }).catch(() => {});
  await beat(page, 3200); // the card arriving, welcome bonus and all
});

await guest.close();

/*
  Give the new customer enough to actually buy something.

  A first take filmed the reward LADDER instead of a purchase, because a
  brand-new card holds only the welcome bonus and every reward was out of reach.
  A clip of somebody unable to afford anything is the opposite of the point.
  Credited through the real RPC, so the points arrive exactly as at the counter.
*/
const { createClient } = await import("@supabase/supabase-js");
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
{
  const { data: biz } = await svc.from("businesses").select("id").eq("slug", SHOP).single();
  await svc.rpc("credit_points", { p_business_id: biz.id, p_phone: `+216${NEWPHONE}`, p_amount_tnd: 120 });
}

const diner = await context();
{
  const page = await diner.newPage();
  await page.goto(`${BASE}/moi`, { waitUntil: "networkidle" });
  await page.fill('input[name="phone"]', NEWPHONE);
  await page.fill('input[name="pin"]', PIN);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2600);
  await page.close();
}

await clip(diner, "redeem", async (page) => {
  await page.goto(`${BASE}/${SHOP}/boutique`, { waitUntil: "networkidle" });
  await beat(page, 1600);
  const buy = page.locator('form button[type="submit"]').first();
  if (!(await buy.count()) || !(await buy.isEnabled())) throw new Error("nothing affordable to buy");
  await buy.click();
  await beat(page, 3400); // the code panel
});

await clip(diner, "wallet", async (page) => {
  await page.goto(`${BASE}/cartes`, { waitUntil: "networkidle" });
  await beat(page, 2000); // the staggered arrival
  await page.mouse.wheel(0, 300);
  await beat(page, 1600);
});

await diner.close();
await browser.close();

/* videos only exist once their context has closed */
for (const [from, name] of pending) {
  if (existsSync(from)) {
    await rename(from, `${OUT}/${name}.webm`);
    console.log(`  ✓ ${OUT}/${name}.webm`);
  }
}
await rm(TMP, { recursive: true, force: true });

/*
  Remove the customer created for the shoot. These captures run against the REAL
  database — leaving "Karim" and his points behind would quietly inflate the demo
  café's own analytics, which are the numbers the landing page then shows.
*/
{
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
