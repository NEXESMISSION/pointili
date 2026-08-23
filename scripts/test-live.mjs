/**
 * THE POINTS LANDING ON THE CUSTOMER'S OWN SCREEN, WHILE THEY WATCH.
 *
 *   node scripts/test-live.mjs
 *
 * A customer holds their phone out at the counter. The cashier credits them.
 * Their card has to say so — instantly, on the screen that is already open,
 * without a reload and without them touching anything.
 *
 * The first credit here goes through the REAL TILL in a second browser, because
 * that is the whole chain and the only version of it worth proving. The rest go
 * through the RPC the till calls, which is the same write and a great deal
 * faster to arrange.
 *
 * Five things: it fires, it says the right number, the page underneath ends up
 * true, it stays quiet when a balance goes DOWN, and the endpoint feeding it
 * hands nothing to somebody with no card.
 *
 * Exits non-zero on any failure.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { env } from "./db.mjs";
import { ensureTestCafe, dropTestCafe, TEST_SLUG, OWNER_EMAIL } from "./fixture.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const LOCAL = `2${String(Date.now()).slice(-7)}`;
const NORM = `+216${LOCAL}`;

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const { id: cafeId, ownerPassword: OWNER_PASSWORD } = await ensureTestCafe();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
await admin
  .from("loyalty_programs")
  .update({ stamps_enabled: true, stamps_required: 2, stamp_reward: "Café offert (live)" })
  .eq("business_id", cafeId);

const browser = await chromium.launch({ executablePath: CHROME });
const LANG_FR = { name: "pointili_lang", value: "fr", url: BASE };
const newFrenchPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([LANG_FR]);
  return ctx.newPage();
};

/* ── the customer, with their card open at the counter ────────────────── */
const diner = await newFrenchPage();
await diner.goto(`${BASE}/${TEST_SLUG}/rejoindre`, { waitUntil: "networkidle" });
await diner.fill('input[name="phone"]', LOCAL);
await diner.fill('input[name="pin"]', "4271");
await diner.fill('input[name="name"]', "Habitue");
await diner.click('button[type="submit"]');
await diner.waitForURL(`**/${TEST_SLUG}`, { timeout: 15000 }).catch(() => {});
const { data: card } = await admin.from("accounts").select("code").eq("phone", NORM).maybeSingle();
check("the customer is on their card", diner.url().includes(TEST_SLUG), diner.url().replace(BASE, ""));

/** Wait for the celebration overlay, and say what it showed. */
const celebration = async (kind, ms = 12000) => {
  const el = diner.locator(`[data-live-celebration="${kind}"]`);
  await el.waitFor({ timeout: ms }).catch(() => {});
  if (!(await el.count())) return null;
  return (await el.innerText()).replace(/\n+/g, " · ");
};

/* ── 1. THE WHOLE CHAIN: a cashier at the real till ───────────────────── */
const staff = await newFrenchPage();
await staff.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
await staff.fill('input[name="email"]', OWNER_EMAIL);
await staff.fill('input[name="password"]', OWNER_PASSWORD);
await staff.click('button[type="submit"]');
await staff.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});

await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
await staff.locator('button:has-text("Donner des points")').click();
await staff.locator('input[name="amount"]').waitFor({ timeout: 15000 });
await staff.fill('input[name="amount"]', "12");
await staff.locator('button:has-text("Créditer")').click();
await staff.locator('input[name="customer"]').waitFor({ timeout: 15000 });
await staff.fill('input[name="customer"]', card.code);
await staff.locator('button:has-text("Confirmer")').click();
await staff.locator("[data-receipt]").waitFor({ timeout: 20000 }).catch(() => {});

const points = await celebration("points");
check("the customer's own screen announces the points, with no reload", Boolean(points), points ?? "nothing appeared");
check("...and it is the amount that was actually credited", /\+12\b/.test(points ?? ""), points ?? "");

/*
  The overlay is a flourish; the CARD has to be true when it fades. Polled
  rather than slept on: the refresh is a server round trip.
*/
let onCard = "";
for (let i = 0; i < 25; i++) {
  onCard = await diner.locator("main").innerText().catch(() => "");
  if (/\b22\b/.test(onCard)) break;
  await diner.waitForTimeout(600);
}
check("the card itself ends up showing the new balance", /\b22\b/.test(onCard),
  onCard.split("\n").find((l) => /\b22\b/.test(l)) ?? "no line carries 22");

/* ── 2. A stamp, on the same open screen ──────────────────────────────── */
await admin.rpc("add_stamp", { p_business_id: cafeId, p_phone: NORM, p_delta: 1 });
const stamp = await celebration("stamp");
check("a stamp announces itself too", Boolean(stamp), stamp ?? "nothing appeared");
check("...and counts toward the card", /1\s*\/\s*2/.test(stamp ?? ""), stamp ?? "");

/* ── 3. The card fills — which looks like stamps going BACKWARDS ──────── */
await admin.rpc("add_stamp", { p_business_id: cafeId, p_phone: NORM, p_delta: 1 });
const full = await celebration("full");
check("a completed card is celebrated, not read as a loss", Boolean(full), full ?? "nothing appeared");
check("...and it names what was won", /Caf.\s*offert/i.test(full ?? ""), full ?? "");

/* ── 4. Spending points is NOT a celebration ──────────────────────────── */
await diner.waitForTimeout(3000); // let the last overlay retire
const before = await diner.locator("[data-live-celebration]").count();
await admin.rpc("owner_adjust_points", { p_business_id: cafeId, p_phone: NORM, p_delta: -5 });
await diner.waitForTimeout(6000);
check("a balance going down says nothing",
  (await diner.locator("[data-live-celebration]").count()) === before,
  `${await diner.locator("[data-live-celebration]").count()} overlay(s)`);

let afterSpend = "";
for (let i = 0; i < 25; i++) {
  afterSpend = await diner.locator("main").innerText().catch(() => "");
  if (/\b17\b/.test(afterSpend)) break;
  await diner.waitForTimeout(600);
}
check("...but the card still updates itself", /\b17\b/.test(afterSpend),
  afterSpend.split("\n").find((l) => /\b17\b/.test(l)) ?? "no line carries 17");

/* ── 4b. THE SIGN STAYS IN FRONT OF THE NUMBER IN TUNISIAN ─────────────
   "+" and "/" are bidi-NEUTRAL: in an RTL paragraph they attach to whichever
   side the algorithm picks, and the first version of this screen rendered the
   most important number on it as "8+". The figure is pinned dir="ltr", and this
   is the check that fails if somebody takes that off. */
await diner.context().addCookies([{ name: "pointili_lang", value: "tn", url: BASE }]);
await diner.goto(`${BASE}/${TEST_SLUG}`, { waitUntil: "networkidle" });
await admin.rpc("credit_points", { p_business_id: cafeId, p_phone: NORM, p_amount_tnd: 9 });
const arabic = await celebration("points");
check("Tunisian gets the news too", Boolean(arabic), arabic ?? "nothing appeared");
const figure = await diner.locator(".live-figure").first().innerText().catch(() => "");
check("...with the + in FRONT of the number, not behind it", /^\+\s*9\b/.test(figure.trim()),
  JSON.stringify(figure));

/* ── 5. The endpoint hands nothing to a stranger ──────────────────────── */
const stranger = await browser.newContext();
const anon = await stranger.newPage();
const res = await anon.request.get(`${BASE}/api/pulse?s=${TEST_SLUG}`);
const body = await res.json().catch(() => ({}));
check("no card, no figures", body.balance === 0 && body.stamps === 0 && body.codes === 0, JSON.stringify(body));
check("...and never a phone number in the answer", !JSON.stringify(body).includes(LOCAL), JSON.stringify(body));
check("nothing about it is cacheable", /no-store/i.test(res.headers()["cache-control"] ?? ""),
  res.headers()["cache-control"] ?? "none");

/* A made-up shop is answered with the same empty shape, never a 404 that says
   "this slug exists". */
const bogus = await anon.request.get(`${BASE}/api/pulse?s=definitely-not-a-shop`);
check("an unknown shop is answered the same way", bogus.ok(), `status ${bogus.status()}`);

await browser.close();
await dropTestCafe();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} live checks passed`);
if (failed.length) {
  console.log(failed.map((f) => `  FAILED: ${f.name}`).join("\n"));
  process.exit(1);
}
