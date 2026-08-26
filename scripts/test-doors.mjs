/**
 * THE TWO DOORS: signing up with no shop, and crossing between the two apps.
 *
 *   node scripts/test-doors.mjs
 *
 * Signing up used to require standing in a café — the only form lived at
 * /[slug]/rejoindre, which you reach by scanning a QR taped to a counter. And an
 * owner is a customer too, but on a PHONE the owner app had no way into the
 * customer one at all: the only link was in the laptop sidebar.
 *
 * What has to hold:
 *
 *   · a stranger can create an account from /moi, and lands somewhere that
 *     tells them what their code is for;
 *   · signing up on a number that ALREADY has an account is not announced —
 *     the right PIN just signs them in, the wrong one gets the same vague
 *     sentence as everywhere else, because "that number is registered" is an
 *     oracle for whether a Tunisian mobile belongs to a Pointili customer;
 *   · the brute-force gate covers this form, since it is a way to mint rows;
 *   · no welcome bonus and no card is invented out of a shop that was never
 *     involved;
 *   · an owner on a phone can reach the customer app and get back.
 *
 * Exits non-zero on any failure.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { env } from "./db.mjs";
import { ensureTestCafe, dropTestCafe, OWNER_EMAIL } from "./fixture.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const LOCAL = `2${String(Date.now()).slice(-7)}`;
const NORM = `+216${LOCAL}`;

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const { ownerPassword: OWNER_PASSWORD } = await ensureTestCafe();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const browser = await chromium.launch({ executablePath: CHROME });
const LANG_FR = { name: "pointili_lang", value: "fr", url: BASE };
const newFrenchPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([LANG_FR]);
  return ctx.newPage();
};

/** Open the signup form, which lives folded under the sign-in one. */
const openSignUp = async (page) => {
  await page.goto(`${BASE}/moi`, { waitUntil: "networkidle" });
  await page.locator('summary:has-text("crée ton compte")').click();
  await page.locator('input[name="pin"][autocomplete="new-password"]').waitFor({ timeout: 15000 });
};

/* ── 1. A stranger, with no shop anywhere in sight ────────────────────── */
const p = await newFrenchPage();
await openSignUp(p);
check("the customer door offers a way to create an account", true);

await p.fill('form:has(input[autocomplete="new-password"]) input[name="phone"]', LOCAL);
await p.fill('form:has(input[autocomplete="new-password"]) input[name="name"]', "Nouveau");
await p.fill('input[name="pin"][autocomplete="new-password"]', "5150");
await p.locator('button:has-text("Créer mon compte")').click();
await p.waitForURL("**/cartes", { timeout: 20000 }).catch(() => {});
check("it signs them in and lands on their wallet", p.url().includes("/cartes"), p.url().replace(BASE, ""));

const { data: acc } = await admin.from("accounts").select("code, name").eq("phone", NORM).maybeSingle();
check("the account exists, with a platform-wide code", Boolean(acc?.code) && acc.code.length === 4, acc?.code ?? "none");
check("...and the name they gave", acc?.name === "Nouveau", acc?.name ?? "none");

const walletTxt = await p.locator("body").innerText();
check("the wallet shows them that code", walletTxt.includes(acc.code), acc.code);
check("...and says what to do with an empty one",
  /Scanne le QR/i.test(walletTxt), walletTxt.split("\n").find((l) => /Scanne/i.test(l)) ?? "");

/* NOTHING was invented out of a shop that was never involved. */
const { count: cards } = await admin
  .from("diner_cafes").select("phone", { count: "exact", head: true }).eq("phone", NORM);
check("no card was invented at a shop they have not visited", (cards ?? 0) === 0, `${cards} card(s)`);
const { count: ledger } = await admin
  .from("points_ledger").select("id", { count: "exact", head: true }).eq("customer_phone", NORM);
check("no welcome bonus out of nowhere", (ledger ?? 0) === 0, `${ledger} row(s)`);

/* ── 2. A number that is already taken is never announced ─────────────── */
const q = await newFrenchPage();
await openSignUp(q);
await q.fill('form:has(input[autocomplete="new-password"]) input[name="phone"]', LOCAL);
await q.fill('input[name="pin"][autocomplete="new-password"]', "9999");
await q.locator('button:has-text("Créer mon compte")').click();
await q.waitForTimeout(4000);
const refused = await q.locator('[role="alert"]').first().innerText().catch(() => "");
check("a taken number with the wrong code is refused vaguely",
  /incorrect/i.test(refused) && !/exist|d\u00e9j\u00e0 pris|taken/i.test(refused), refused);
check("...and it did NOT sign them in", !q.url().includes("/cartes"), q.url().replace(BASE, ""));

/* The right code on a taken number is simply a sign-in. */
const r = await newFrenchPage();
await openSignUp(r);
await r.fill('form:has(input[autocomplete="new-password"]) input[name="phone"]', LOCAL);
await r.fill('input[name="pin"][autocomplete="new-password"]', "5150");
await r.locator('button:has-text("Créer mon compte")').click();
await r.waitForURL("**/cartes", { timeout: 20000 }).catch(() => {});
check("the owner of that number is simply let in", r.url().includes("/cartes"), r.url().replace(BASE, ""));

const { count: accounts } = await admin
  .from("accounts").select("phone", { count: "exact", head: true }).eq("phone", NORM);
check("and no second account was minted for one number", (accounts ?? 0) === 1, `${accounts}`);

/* ── 3. The owner can cross into the customer app, and back ───────────── */
const staff = await newFrenchPage();
await staff.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
await staff.fill('input[name="email"]', OWNER_EMAIL);
await staff.fill('input[name="password"]', OWNER_PASSWORD);
await staff.click('button[type="submit"]');
await staff.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});

await staff.goto(`${BASE}/owner/reglages`, { waitUntil: "networkidle" });
const door = staff.locator('a[href="/cartes"]');
check("the owner app has a door to the customer side on a phone", (await door.count()) > 0);
await door.first().click();
await staff.waitForTimeout(3000);
check("...and it opens in the SAME window, not a browser tab",
  staff.url().includes("/cartes") || staff.url().includes("/moi"), staff.url().replace(BASE, ""));

/* The way back is the pill, and it is shown to owners and nobody else. */
check("an owner sees the way back to the till",
  (await staff.locator('a[href="/owner"]:has-text("caisse")').count()) > 0);
check("a customer never sees it",
  (await p.locator('a[href="/owner"]').count()) === 0, "on the new account's wallet");

await browser.close();
await dropTestCafe();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} door checks passed`);
if (failed.length) {
  console.log(failed.map((f) => `  FAILED: ${f.name}`).join("\n"));
  process.exit(1);
}
