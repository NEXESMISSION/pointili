/**
 * THE THREE THINGS A CUSTOMER'S HANDS DO.
 *
 *   node scripts/test-diner-ui.mjs
 *
 * · ONE QR AT A TIME. The codes list used to print every pending reward as a
 *   full ticket, QR and all, stacked down the screen. Three rewards is three
 *   scannable pictures inside a few centimetres of glass, and a camera does not
 *   ask which one you meant — the cashier collects the wrong reward and nothing
 *   on either screen says so. The list carries no picture now; the sheet does.
 *
 * · ADDING A CARD. The wallet has always told people to scan a shop's QR and
 *   never offered a way to. What a scan is ALLOWED to mean is a security
 *   boundary — a QR is a string a stranger controls — so lib/qrLink gets a
 *   table of cases rather than a screenshot.
 *
 * · PULLING TO REFRESH, and only inside the installed app, where there is no
 *   address bar and no reload button. A second one underneath a browser's own
 *   would fight it for the same twenty pixels.
 *
 * Exits non-zero on any failure.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { env } from "./db.mjs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureTestCafe, dropTestCafe, TEST_SLUG } from "./fixture.mjs";
import { slugFrom } from "../lib/qrLink.ts";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const LOCAL = `2${String(Date.now()).slice(-7)}`;
const NORM = `+216${LOCAL}`;

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/* ── 1. What a scanned QR may mean — the parsing IS the boundary ───────── */
const CASES = [
  ["https://www.pointili.online/coffeelain", "coffeelain", "the ordinary case"],
  ["https://pointili.online/coffeelain", "coffeelain", "the apex, for a sticker printed before www"],
  ["http://pointili.online/coffeelain/", "coffeelain", "a trailing slash"],
  ["https://www.pointili.online/coffeelain?x=1#y", "coffeelain", "query and hash are not part of a slug"],
  ["coffeelain", "coffeelain", "a bare slug, for a QR that holds no URL"],
  ["  Coffeelain  ", "coffeelain", "trimmed and lower-cased"],
  /* The one that matters: a hostile sticker. Only the PATH is read, so the
     worst it can do is name a page of ours. */
  ["https://evil.example.com/coffeelain", "coffeelain", "a stranger's host cannot send anybody there"],
  ["https://evil.example.com/", null, "…and with no slug it means nothing at all"],
  ["javascript:alert(1)", null, "a script URL is not a shop"],
  ["https://www.pointili.online/moi", null, "a real route is not a shop"],
  ["https://www.pointili.online/owner/reglages", null, "nor is the till"],
  ["https://www.pointili.online/-nope", null, "a leading hyphen is not a slug"],
  ["", null, "nothing is nothing"],
];
for (const [input, want, why] of CASES) {
  const got = slugFrom(input);
  check(`slug: ${why}`, got === want, `${JSON.stringify(input)} → ${JSON.stringify(got)}`);
}

/* ── the app itself ───────────────────────────────────────────────────── */
const { id: cafeId } = await ensureTestCafe();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
await ctx.addCookies([{ name: "pointili_lang", value: "fr", url: BASE }]);
const page = await ctx.newPage();

await page.goto(`${BASE}/${TEST_SLUG}/rejoindre`, { waitUntil: "networkidle" });
await page.fill('input[name="phone"]', LOCAL);
await page.fill('input[name="pin"]', "4271");
await page.fill('input[name="name"]', "Habitue");
await page.click('button[type="submit"]');
await page.waitForURL(`**/${TEST_SLUG}`, { timeout: 15000 }).catch(() => {});

/* Two rewards waiting, which is the whole point: one QR must never sit beside
   another. Minted through the RPCs the shop itself uses. */
await admin.rpc("credit_points", { p_business_id: cafeId, p_phone: NORM, p_amount_tnd: 500 });
const { data: rewards } = await admin
  .from("loyalty_rewards").select("id").eq("business_id", cafeId).order("position").limit(2);
for (const r of rewards ?? []) {
  await admin.rpc("redeem_at_counter", { p_business_id: cafeId, p_phone: NORM, p_reward_id: r.id });
}

await page.goto(`${BASE}/${TEST_SLUG}/codes`, { waitUntil: "networkidle" });
const rows = page.locator("main ul li button");
await rows.first().waitFor({ timeout: 15000 });
check("both rewards are listed", (await rows.count()) === 2, `${await rows.count()} row(s)`);

/*
  WHAT COUNTS AS A SCANNABLE PICTURE.

  Not "an svg" — the row carries a little QR glyph as its affordance, and that
  is exactly the thing a customer taps. The real ones come from one renderer
  (lib/qr → the qrcode package) which stamps every picture it draws with
  shape-rendering="crispEdges". Counting THAT is the difference between a
  decoration and something a camera can read.
*/
const qrsIn = async (scope) =>
  page.locator(`${scope} svg[shape-rendering="crispEdges"]`).count();
check("the list carries no scannable picture at all", (await qrsIn("main ul")) === 0);

await rows.first().click();
/*
  Scoped to the APP's dialog, not to any dialog.

  Next's dev overlay is itself a [role="dialog"], so a bare selector resolves to
  two elements the moment the page reports a recoverable error and Playwright
  refuses the ambiguity — the suite dies pointing at the overlay rather than at
  whatever caused it. Same lesson as the dev overlay owning [role=alert]: in
  development, the app does not have these roles to itself.
*/
const sheet = page.locator('[role="dialog"]:not([data-nextjs-dialog])');
await sheet.waitFor({ timeout: 10000 });
check("tapping a reward opens it", await sheet.isVisible());
check("...with exactly ONE QR on the screen", (await qrsIn("body")) === 1, `${await qrsIn("body")} picture(s)`);

/*
  The code is taken from the DATABASE and matched against the sheet, never
  scraped out of it. A regex over the rendered text found "COMPENSE" inside
  "RÉCOMPENSE" and cheerfully claimed a code that does not exist — which passed
  the assertion it was feeding and broke the two after it.
*/
const sheetTxt = await sheet.innerText();
const { data: pending } = await admin.rpc("diner_codes", { p_business_id: cafeId, p_phone: NORM });
const issued = (pending ?? []).map((c) => c.code);
const shownCode = issued.find((c) => sheetTxt.includes(c)) ?? "";
check("...and it is one of the customer's real codes", Boolean(shownCode),
  `${issued.join("/")} vs ${sheetTxt.replace(/\n+/g, " · ").slice(0, 60)}`);
check("...and only that one", issued.filter((c) => sheetTxt.includes(c)).length === 1);

/*
  THE SHEET WATCHES ITSELF BE COLLECTED. The card polls, so when the counter
  claims this code the list loses it — and the sheet must say so rather than
  blink out from under the customer's thumb.
*/
await admin.rpc("claim_code", { p_business_id: cafeId, p_code: shownCode });
/*
  THE ANNOUNCEMENT MOVED, AND THIS CHECK HAD NOT.

  The sheet used to print "Récupéré" in green and then close. Commit 5333349
  took that out and replaced it with a full-screen celebration — the reward
  crossing the counter is the end of the whole loop, and a line inside a sheet
  the customer may already have thumbed away was the wrong place for it. That
  commit updated test-live; this suite still waited for the deleted text, so it
  failed on behaviour that is correct and better.

  It asserts the celebration by its own hook now, and then the thing that is
  genuinely this suite's subject: the sheet does not blink out from under the
  thumb — it holds a beat, then closes.
*/
const taken = await page
  .locator('[data-live-celebration="collected"]')
  .waitFor({ timeout: 20000 })
  .then(() => true)
  .catch(() => false);
check("the counter taking it says so on the customer's screen", taken);
const closed = await page
  .locator('[role="dialog"]:not([data-nextjs-dialog])')
  .waitFor({ state: "detached", timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check("...and the ticket closes itself rather than vanishing mid-tap", closed);

await page.waitForTimeout(2600);
check("...and then the sheet closes itself", (await page.locator('[role="dialog"]').count()) === 0);

/* ── 3. The wallet can finally scan ───────────────────────────────────── */
await page.goto(`${BASE}/cartes`, { waitUntil: "networkidle" });
const add = page.locator('button:has-text("Ajouter une carte")').first();
await add.waitFor({ timeout: 15000 });
check("the wallet offers a way to add a card", await add.isVisible());
await add.click();
const scanner = page.locator('[role="dialog"][aria-label="Ajouter une carte"]');
await scanner.waitFor({ timeout: 10000 });
check("...and it opens a reader", await scanner.isVisible(),
  (await scanner.innerText()).replace(/\n+/g, " · ").slice(0, 60));
await page.locator('[role="dialog"] button:has-text("Fermer")').click();
await page.waitForTimeout(400);
check("...that closes again", (await page.locator('[role="dialog"]').count()) === 0);

/* ── 4. Pull to refresh, installed only ───────────────────────────────── */
const drag = async (p, distance) => {
  const cdp = await p.context().newCDPSession(p);
  const at = (y) => [{ x: 190, y, radiusX: 6, radiusY: 6, force: 1, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(120) });
  for (let y = 130; y <= 120 + distance; y += 20) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(y) });
    await p.waitForTimeout(16);
  }
  const seen = await p.locator(".ptr").count();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  return seen;
};

await page.goto(`${BASE}/${TEST_SLUG}`, { waitUntil: "networkidle" });
check("a browser keeps its own gesture — ours does not appear", (await drag(page, 300)) === 0);

/*
  A REAL APP WINDOW, because display-mode cannot be emulated.

  Emulation.setEmulatedMedia accepts the feature and Chrome ignores it —
  matchMedia("(display-mode: standalone)") stays false, so the component under
  test never mounts and every assertion below it passes for the wrong reason.
  Chrome's own --app= flag produces the genuine article: no address bar, no
  reload button, and standalone reported honestly.

  Its own profile means its own cookie jar, so this drives a page that needs no
  session — the gesture lives in the root layout and is on every screen.
*/
const profile = await mkdtemp(join(tmpdir(), "pointili-pwa-"));
const app = await chromium.launchPersistentContext(profile, {
  executablePath: CHROME,
  args: [`--app=${BASE}/moi`],
  viewport: { width: 390, height: 844 },
  hasTouch: true,
});
const pwa = app.pages()[0];
await pwa.waitForLoadState("networkidle").catch(() => {});
check("the installed app reports standalone",
  await pwa.evaluate(() => matchMedia("(display-mode: standalone)").matches));

await drag(pwa, 60);
check("a short flick does NOT arm it", (await pwa.locator(".ptr-dial--busy").count()) === 0);
await pwa.waitForTimeout(500);

const shownDuring = await drag(pwa, 320);
check("a long pull shows the indicator", shownDuring > 0, `${shownDuring} indicator(s) during the drag`);
await pwa.waitForTimeout(2500);
check("...and it retires once the page is fresh", (await pwa.locator(".ptr").count()) === 0);

await app.close();
await browser.close();
await dropTestCafe();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} diner-UI checks passed`);
if (failed.length) {
  console.log(failed.map((f) => `  FAILED: ${f.name}`).join("\n"));
  process.exit(1);
}
