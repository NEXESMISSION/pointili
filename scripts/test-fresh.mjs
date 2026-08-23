/**
 * THE APP REPAIRS ITSELF AFTER A DEPLOY (components/StayFresh).
 *
 *   node scripts/test-fresh.mjs
 *
 * Every HTML response here is `no-store`, so a navigation always lands on the
 * new deploy. The thing that does not is a tab that is already open — the till
 * behind a counter, an installed PWA window — which after its first load fetches
 * only RSC payloads and goes on running the JavaScript it launched with. When
 * the next deploy removes the content-hashed chunks that bundle still expects,
 * the first screen that needs one dies with a ChunkLoadError.
 *
 * Four properties, and two of them are about NOT firing:
 *
 *   · a new build id, noticed when the app is picked back up, reloads it;
 *   · a failed chunk reloads it immediately, because it is already broken;
 *   · it never reloads over a dialog or a half-typed field;
 *   · it never reloads twice for the same version — no device refreshing itself
 *     forever behind a counter, whatever the comparison says.
 *
 * Exits non-zero on any failure.
 */
import { chromium } from "playwright-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.context().addCookies([{ name: "pointili_lang", value: "fr", url: BASE }]);

/* ── the build stamp exists and is not a placeholder ─────────────────── */
const res = await page.request.get(`${BASE}/api/version`);
const body = await res.json().catch(() => ({}));
check("the server says which build is serving", res.ok() && typeof body.build === "string" && body.build.length > 0,
  JSON.stringify(body));
check("...and never lets that answer be cached",
  /no-store/i.test(res.headers()["cache-control"] ?? ""), res.headers()["cache-control"] ?? "none");

/*
  A MARKER THAT ONLY SURVIVES IF THE PAGE DID NOT RELOAD.

  Cleaner than watching for load events: a reload wipes the JS context, so the
  marker's absence IS the reload, and its presence is proof nothing happened.
*/
const mark = () => page.evaluate(() => { window.__stillHere = true; });
const survived = () => page.evaluate(() => Boolean(window.__stillHere));

/** Answer /api/version with whatever this test wants the server to be. */
let serverBuild = "unchanged";
await page.route("**/api/version", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "cache-control": "no-store" },
    body: JSON.stringify({ build: serverBuild }),
  }),
);

/* The landing page: no session needed, and StayFresh is in the root layout. */
await page.goto(BASE, { waitUntil: "networkidle" });

/* ── 1. The same build is not a reason to do anything ────────────────── */
serverBuild = await page.evaluate(() => document.documentElement.dataset.buildProbe ?? "");
await page.evaluate(async () => {
  /* Ask the app what it thinks it is, the same way it does. */
  const r = await fetch("/api/version", { cache: "no-store" });
  window.__seen = (await r.json()).build;
});
await mark();
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await page.waitForTimeout(1500);
check("an unchanged build leaves the tab alone", await survived());

/* ── 2. A half-typed field is worth more than being current ──────────── */
serverBuild = "deploy-2";
await page.evaluate(() => {
  const i = document.createElement("input");
  i.id = "busy";
  i.value = "47,500";
  document.body.appendChild(i);
});
await mark();
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await page.waitForTimeout(1500);
check("a new build does NOT reload over a half-typed field", await survived());

/* ── 3. Nor over something being read ────────────────────────────────── */
await page.evaluate(() => {
  document.getElementById("busy")?.remove();
  const d = document.createElement("div");
  d.id = "sheet";
  d.setAttribute("role", "dialog");
  document.body.appendChild(d);
});
await mark();
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await page.waitForTimeout(1500);
check("...nor over an open dialog", await survived());

/* ── 4. Put it down, and it updates ──────────────────────────────────── */
await page.evaluate(() => document.getElementById("sheet")?.remove());
await mark();
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await page.waitForTimeout(2500);
check("with nothing to lose, a new build reloads the tab", !(await survived()));

/* ── 5. And exactly once ─────────────────────────────────────────────── */
await page.waitForLoadState("networkidle");
await mark();
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await page.waitForTimeout(2500);
check("it never reloads twice for the same version", await survived());

/* ── 6. A dead chunk is repaired without waiting to be put down ───────── */
const chunkPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
await chunkPage.context().addCookies([{ name: "pointili_lang", value: "fr", url: BASE }]);
await chunkPage.goto(BASE, { waitUntil: "networkidle" });
await chunkPage.evaluate(() => { window.__stillHere = true; });
await chunkPage.evaluate(() => {
  /* What the browser actually throws when a deploy has removed the file the
     running bundle is asking for. */
  window.dispatchEvent(
    new ErrorEvent("error", { message: "ChunkLoadError: Loading chunk 4821 failed." }),
  );
});
await chunkPage.waitForTimeout(2500);
check("a missing chunk reloads immediately — the app is already broken",
  !(await chunkPage.evaluate(() => Boolean(window.__stillHere))));

/* ...and that one is capped too, or a chunk that is missing from BOTH builds
   would refresh the device in a loop. */
await chunkPage.waitForLoadState("networkidle");
await chunkPage.evaluate(() => { window.__stillHere = true; });
await chunkPage.evaluate(() => {
  window.dispatchEvent(new ErrorEvent("error", { message: "ChunkLoadError: Loading chunk 4821 failed." }));
});
await chunkPage.waitForTimeout(2500);
check("...once, so a chunk missing from both builds cannot loop",
  await chunkPage.evaluate(() => Boolean(window.__stillHere)));

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} freshness checks passed`);
if (failed.length) {
  console.log(failed.map((f) => `  FAILED: ${f.name}`).join("\n"));
  process.exit(1);
}
