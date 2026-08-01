/**
 * Film the REAL app for the landing page.
 *
 *   node scripts/capture.mjs
 *
 * Not a re-creation. Playwright drives the actual product against the demo café
 * (35 customers, ~90 days of history) and records what happens, so every pixel
 * on the marketing page is the software doing the thing it claims to do.
 *
 * ONE CONTEXT PER AUDIENCE, ONE PAGE PER CLIP.
 *
 * Playwright writes one video per PAGE, so a single context produces many clips.
 * That matters for a reason that cost a whole run: Supabase rotates the refresh
 * token every time it is used, so a saved storageState replayed into six
 * separate contexts is spent after the first — every later clip silently filmed
 * the LOGIN SCREEN instead of the till, at a convincing 44 KB apiece. One live
 * session, many pages, no replay.
 *
 * THE SHOOT USES ITS OWN CUSTOMER, BY PHONE NUMBER.
 *
 * The till is driven with a phone number rather than a 4-char code, because that
 * is the path a cashier takes with somebody who has not shown their card. The
 * number belongs to an account this script creates and deletes — filming a real
 * cardholder would publish a real person's phone number on the landing page.
 *
 * Output → public/demo/  (a .webm and a matching .png poster per clip)
 */
import { chromium } from "playwright-core";
import { mkdir, rm, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "./db.mjs";

const run = promisify(execFile);

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG =
  process.env.FFMPEG ??
  `${process.env.LOCALAPPDATA}/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe`;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "public/demo";
const TMP = "scratch/capture-tmp";

const OWNER = { email: "elmanar@pointili.online", password: process.env.DEMO_PASSWORD ?? "ElManar2026" };
const SHOP = "cafe-el-manar";
const PHONE_SIZE = { width: 390, height: 844 };

/* The shoot's own customer. Created, filmed, then deleted. */
const NUM = `2${String(Date.now()).slice(-7)}`;
const PIN = "4271";

await mkdir(OUT, { recursive: true });
await rm(TMP, { recursive: true, force: true });
await mkdir(TMP, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });

/*
  Injected into every page.

  1 · Next's dev indicator is a floating badge that sits on the nav — it was
      covering "Réglages" — and would be in every frame of a marketing asset.

  2 · A CURSOR AND A CLICK RING. Playwright moves a real mouse and dispatches
      real events, but the pointer is invisible to the recorder, so a viewer sees
      fields fill and panels open with no idea what was touched. A soft dot
      follows the pointer and a red ring blooms where it presses, which is the
      difference between watching a demo and being shown one.
*/
const OVERLAY = `
  nextjs-portal, #__next-build-watcher, [data-nextjs-toast],
  [data-nextjs-dev-tools-button], #__next-dev-tools-indicator { display: none !important; }
`;

const CURSOR = `(() => {
  const put = () => {
    if (!document.body || document.getElementById("__shoot_cursor")) return;
    const dot = document.createElement("div");
    dot.id = "__shoot_cursor";
    dot.style.cssText =
      "position:fixed;z-index:2147483647;pointer-events:none;width:20px;height:20px;" +
      "margin:-10px 0 0 -10px;border-radius:50%;background:rgba(255,255,255,.22);" +
      "border:2px solid rgba(255,255,255,.92);box-shadow:0 2px 12px rgba(0,0,0,.55);" +
      "opacity:0;transition:transform .08s ease,opacity .2s ease;left:0;top:0";
    document.body.appendChild(dot);

    addEventListener("mousemove", (e) => {
      dot.style.opacity = "1";
      dot.style.left = e.clientX + "px";
      dot.style.top = e.clientY + "px";
    }, true);

    addEventListener("pointerdown", (e) => {
      dot.style.transform = "scale(.65)";
      const ring = document.createElement("div");
      ring.style.cssText =
        "position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;" +
        "width:16px;height:16px;margin:-8px 0 0 -8px;border:3px solid #ff3b5c;" +
        "left:" + e.clientX + "px;top:" + e.clientY + "px";
      document.body.appendChild(ring);
      ring.animate(
        [{ transform: "scale(1)", opacity: .95 }, { transform: "scale(4.2)", opacity: 0 }],
        { duration: 520, easing: "cubic-bezier(.2,.8,.3,1)" },
      ).onfinish = () => ring.remove();
    }, true);

    addEventListener("pointerup", () => { dot.style.transform = "scale(1)"; }, true);
  };
  if (document.body) put();
  else document.addEventListener("DOMContentLoaded", put);
})();`;

async function context({ record = true, retina = false } = {}) {
  const ctx = await browser.newContext({
    viewport: PHONE_SIZE,
    ...(retina ? { deviceScaleFactor: 2 } : {}),
    ...(record ? { recordVideo: { dir: TMP, size: PHONE_SIZE } } : {}),
  });
  await ctx.addInitScript((css) => {
    const put = () => {
      const st = document.createElement("style");
      st.textContent = css;
      document.head?.appendChild(st);
    };
    if (document.head) put();
    else document.addEventListener("DOMContentLoaded", put);
  }, OVERLAY);
  await ctx.addInitScript(CURSOR);
  return ctx;
}

/** name → { path, lead } once the context has closed. */
const pending = [];
/** page → the ms at which recording began, so the white lead-in can be cut. */
const born = new WeakMap();
/** page → seconds of blank page before the app first painted. */
const lead = new WeakMap();

/**
 * Navigate and mark where the picture actually starts.
 *
 * A recorded page opens on a blank white document, and that white frame is what
 * a looping <video> shows the instant it wraps — so it reads as a white flash at
 * the END of the clip. Measuring the gap here means it can be cut exactly,
 * rather than guessing a fixed offset that is wrong for every clip.
 */
async function ready(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(450);
  lead.set(page, (Date.now() - born.get(page)) / 1000);
}

async function clip(ctx, name, flow) {
  console.log(`filming: ${name}`);
  const page = await ctx.newPage();
  born.set(page, Date.now());
  try {
    await flow(page);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  } catch (e) {
    console.log(`  ! ${name}: ${String(e.message).split("\n")[0].slice(0, 90)}`);
  }
  const video = page.video();
  const cut = Math.max(0, (lead.get(page) ?? 1.2) - 0.15);
  await page.close();
  if (video) pending.push({ from: await video.path(), name, cut });
}

/** Type like a person, so the clip does not look like a script. */
async function human(page, selector, text, delay = 140) {
  await page.click(selector);
  for (const ch of text) {
    await page.type(selector, ch, { delay: 0 });
    await page.waitForTimeout(delay);
  }
}

const beat = (page, ms = 900) => page.waitForTimeout(ms);

/** Open the till and find our customer BY PHONE — the walk-in path. */
async function findByPhone(page) {
  await ready(page, `${BASE}/owner`);
  await page.locator('input[name="customer"]').waitFor({ timeout: 20000 });
  await beat(page, 600);
  await human(page, 'input[name="customer"]', NUM, 130);
  await beat(page, 400);
  await page.locator('button:has-text("Chercher")').click();
  await page.locator('[role="dialog"]').waitFor({ timeout: 20000 });
  await beat(page, 700);
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  1 · THE CUSTOMER SIGNS UP — this is who every other clip is about     */
/* ══════════════════════════════════════════════════════════════════════ */

const guest = await context();
await clip(guest, "signup", async (page) => {
  await ready(page, `${BASE}/${SHOP}/rejoindre`);
  await beat(page, 700);
  await human(page, 'input[name="phone"]', NUM, 125);
  await beat(page, 250);
  await human(page, 'input[name="pin"]', PIN, 210);
  await beat(page, 250);
  await human(page, 'input[name="name"]', "Karim", 145);
  await beat(page, 450);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/${SHOP}`, { timeout: 25000 }).catch(() => {});
  await beat(page, 3200); // the card arriving, welcome bonus and all
});
await guest.close();

/*
  Give them a realistic history before the till clips.

  A brand-new card holds only the welcome bonus: the till would show a balance of
  10 and nothing affordable in the boutique, which is the opposite of the point.
  Credited through the real RPC, so the points arrive exactly as at the counter.
*/
const { createClient } = await import("@supabase/supabase-js");
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: biz } = await svc.from("businesses").select("id").eq("slug", SHOP).single();
await svc.rpc("credit_points", { p_business_id: biz.id, p_phone: `+216${NUM}`, p_amount_tnd: 195 });

/* ══════════════════════════════════════════════════════════════════════ */
/*  2 · THE OWNER — one signed-in context, one page per clip              */
/* ══════════════════════════════════════════════════════════════════════ */

const owner = await context();
{
  const page = await owner.newPage();
  /*
    networkidle, NOT domcontentloaded. The form posts through a React server
    action, so filling and clicking before hydration types into a live input and
    presses a button wired to nothing — the click "succeeds", the page never
    navigates, and the shoot runs on with no session.
  */
  await page.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
  if (page.url().includes("/login")) {
    await page.fill('input[name="email"]', OWNER.email);
    await page.fill('input[name="password"]', OWNER.password);
    await page.locator('button[type="submit"]').click({ timeout: 25000 }).catch(() => {});
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 }).catch(() => {});
  }
  if (page.url().includes("/login")) {
    console.error(`could not sign in as ${OWNER.email} — nothing to film.`);
    console.error("If the password changed: DEMO_PASSWORD=… node scripts/capture.mjs");
    process.exit(1);
  }
  console.log("signed in — every owner clip shares this session\n");
  await page.close();
}

await clip(owner, "credit", async (page) => {
  await findByPhone(page);
  await human(page, 'input[name="amount"]', "12", 190);
  await beat(page, 450);
  await page.locator('button:has-text("Créditer")').click();
  await beat(page, 3400);
});

await clip(owner, "stamp", async (page) => {
  await findByPhone(page);
  const stamp = page.locator('button:has-text("tampon")').first();
  if (!(await stamp.count())) throw new Error("stamps are off for this café");
  await stamp.click();
  await beat(page, 3200);
});

await clip(owner, "analyses", async (page) => {
  await ready(page, `${BASE}/owner/analyses`);
  await beat(page, 1400);
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 380); await beat(page, 1200); }
});

await clip(owner, "reglages", async (page) => {
  await ready(page, `${BASE}/owner/reglages`);
  await beat(page, 1100);
  const row = page.locator('button:has-text("Les points")').first();
  if (await row.count()) { await row.click(); await beat(page, 2400); }
  else { await page.mouse.wheel(0, 480); await beat(page, 1700); }
});

await clip(owner, "qr", async (page) => {
  await ready(page, `${BASE}/owner/qr`);
  await beat(page, 1400);
  await page.mouse.wheel(0, 420);
  await beat(page, 1600);
});

await clip(owner, "correction", async (page) => {
  await findByPhone(page);
  const more = page.locator('button:has-text("Corriger")').first();
  if (!(await more.count())) throw new Error("no correction control on the sheet");
  await more.click();
  await beat(page, 1900);
  await page.mouse.wheel(0, 240);
  await beat(page, 1900);
});

/* one retina still, in the same live session */
{
  const page = await owner.newPage();
  await page.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/till.png` });
  console.log(`  ✓ ${OUT}/till.png`);
  await page.close();
}
await owner.close();

/* ══════════════════════════════════════════════════════════════════════ */
/*  3 · BACK TO THE CUSTOMER, now that they have points                   */
/* ══════════════════════════════════════════════════════════════════════ */

const diner = await context();
{
  const page = await diner.newPage();
  await page.goto(`${BASE}/moi`, { waitUntil: "networkidle" });
  await page.fill('input[name="phone"]', NUM);
  await page.fill('input[name="pin"]', PIN);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2600);
  await page.close();
}

await clip(diner, "carte", async (page) => {
  await ready(page, `${BASE}/${SHOP}`);
  await beat(page, 1500);
  await page.mouse.wheel(0, 420);
  await beat(page, 1600);
});

await clip(diner, "redeem", async (page) => {
  await ready(page, `${BASE}/${SHOP}/boutique`);
  await beat(page, 1300);
  const buy = page.locator('form button[type="submit"]').first();
  if (!(await buy.count()) || !(await buy.isEnabled())) throw new Error("nothing affordable to buy");
  await buy.click();
  await beat(page, 3400);
});

await clip(diner, "wallet", async (page) => {
  await ready(page, `${BASE}/cartes`);
  await beat(page, 1800);
  await page.mouse.wheel(0, 300);
  await beat(page, 1500);
});

await diner.close();
await browser.close();

/* ══════════════════════════════════════════════════════════════════════ */
/*  4 · CUT THE WHITE LEAD-IN, so the loop is seamless                    */
/* ══════════════════════════════════════════════════════════════════════ */

if (!existsSync(FFMPEG)) {
  console.log(`\nffmpeg not found at ${FFMPEG} — clips keep their white opening.`);
  for (const { from, name } of pending) if (existsSync(from)) await rename(from, `${OUT}/${name}.webm`);
} else {
  for (const { from, name, cut } of pending) {
    if (!existsSync(from)) continue;
    const to = `${OUT}/${name}.webm`;
    try {
      /* Re-encoded, not stream-copied: a copy can only cut at a keyframe, which
         leaves part of the white opening behind. */
      await run(FFMPEG, ["-y", "-ss", String(cut), "-i", from, "-c:v", "libvpx", "-b:v", "900k", "-an", to]);

      /* The poster IS frame 0 of the clip it stands in for.

         It used to be a screenshot taken at the END of the flow, which meant a
         visitor saw the success sheet, then watched the video snap back to the
         keypad the moment it started — a jump that reads as a glitch. Pulling
         the first frame out of the finished file means the still and the first
         moment of playback are the same pixels. */
      await run(FFMPEG, ["-y", "-i", to, "-frames:v", "1", "-update", "1", `${OUT}/${name}.png`]);

      console.log(`  ✓ ${to}  (cut ${cut.toFixed(1)}s of blank opening)`);
    } catch {
      await rename(from, to);
      console.log(`  ✓ ${to}  (uncut — ffmpeg failed)`);
    }
  }
}
await rm(TMP, { recursive: true, force: true });

/*
  Stamp the shoot.

  Every clip keeps its filename between shoots, so a browser that already has
  credit.webm has no reason to ask for it again — you re-record, deploy, and
  still watch last week's footage. The version below is appended as ?v= to every
  asset URL, which makes a new shoot a new URL and settles it for good.
*/
{
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  await writeFile(
    "components/demoVersion.ts",
    `/* Written by scripts/capture.mjs — do not edit by hand.
   Busts the cache when the clips are re-shot; see that script for why. */
export const DEMO_VERSION = "${stamp}";
`,
  );
  console.log(`  ✓ components/demoVersion.ts (${stamp})`);
}

/*
  Remove the customer created for the shoot. These captures run against the REAL
  database — leaving them and their points behind would quietly inflate the demo
  café's own analytics, which are the numbers the landing page then shows.
*/
{
  const norm = `+216${NUM}`;
  for (const t of ["loyalty_redemptions", "stamp_rewards", "loyalty_stamps"]) {
    await svc.from(t).delete().eq("phone", norm);
  }
  await svc.from("points_ledger").delete().eq("customer_phone", norm);
  await svc.from("diner_cafes").delete().eq("phone", norm);
  await svc.from("pin_attempts").delete().eq("phone", norm);
  await svc.from("accounts").delete().eq("phone", norm);
  console.log("cleaned up the shoot's customer");
}
