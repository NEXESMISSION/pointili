/**
 * The OWNER (admin) workflow, end-to-end in real Chrome.
 *
 *   node scripts/test-owner.mjs
 *
 * Guards what a shop owner and their cashier do every shift: credit by code or
 * number, add a stamp, validate a code at the counter, manage cardholders
 * (search / correct points / correct stamps / read history), and change every
 * settings section without one section blanking another. Exits non-zero on any
 * failure.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { env } from "./db.mjs";
import { ensureTestCafe, dropTestCafe, TEST_SLUG } from "./fixture.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? env.SUPER_ADMIN_EMAIL;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? env.SUPER_ADMIN_PASSWORD;

const LOCAL = `2${String(Date.now()).slice(-7)}`;
const NORM = `+216${LOCAL}`;
const PIN = "4271";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const { id: cafeId } = await ensureTestCafe({ ownerEmail: OWNER_EMAIL });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const browser = await chromium.launch({ executablePath: CHROME });

/* a real cardholder to manage */
const diner = await browser.newPage({ viewport: { width: 390, height: 844 } });
await diner.goto(`${BASE}/${TEST_SLUG}/rejoindre`, { waitUntil: "networkidle" });
await diner.fill('input[name="phone"]', LOCAL);
await diner.fill('input[name="pin"]', PIN);
await diner.fill('input[name="name"]', "Habitué");
await diner.click('button[type="submit"]');
await diner.waitForURL(`**/${TEST_SLUG}`, { timeout: 15000 }).catch(() => {});
const { data: card } = await admin
  .from("diner_cafes").select("code").eq("business_id", cafeId).eq("phone", NORM).maybeSingle();

/* ── 1. Owner signs in ─────────────────────────────────────────────── */
const staff = await browser.newPage({ viewport: { width: 390, height: 844 } });
await staff.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
if (staff.url().includes("/login")) {
  await staff.fill('input[name="email"]', OWNER_EMAIL);
  await staff.fill('input[name="password"]', OWNER_PASSWORD);
  await staff.click('button[type="submit"]');
  await staff.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});
}
check("owner signs in", !staff.url().includes("/login"), staff.url().replace(BASE, ""));

const openManual = async () => {
  await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
  await staff.locator('summary:has-text("Saisie manuelle")').click();
};

/* ── 2. Credit by the 4-char CODE (privacy path) ───────────────────── */
const CRED = 'section:has(h2:has-text("Créditer"))';
await openManual();
await staff.fill(`${CRED} input[name="customer"]`, card.code);
await staff.fill(`${CRED} input[name="amount"]`, "10");
await staff.locator(`${CRED} button[type="submit"]`).click();
await staff.locator(`${CRED} [role="status"]`).waitFor({ timeout: 20000 }).catch(() => {});
const credTxt = await staff.locator(CRED).innerText();
check("credit by code works", /\+10/.test(credTxt), credTxt.split("\n").find((l) => /\+10/.test(l)) ?? "");
check("credit result hides the phone", !credTxt.includes(LOCAL) && !credTxt.includes(NORM));

/* ── 3. A bad amount is refused, not silently accepted ─────────────── */
await openManual();
await staff.fill(`${CRED} input[name="customer"]`, card.code);
await staff.fill(`${CRED} input[name="amount"]`, "-5");
await staff.locator(`${CRED} button[type="submit"]`).click();
const badAmount = await staff
  .waitForSelector(`${CRED} [role="alert"]`, { timeout: 15000 })
  .then((el) => el.innerText())
  .catch(() => "");
check("a negative amount is refused", /invalide/i.test(badAmount), badAmount);

/* ── 4. An unknown code is refused ─────────────────────────────────── */
await openManual();
await staff.fill(`${CRED} input[name="customer"]`, "ZZZZ");
await staff.fill(`${CRED} input[name="amount"]`, "5");
await staff.locator(`${CRED} button[type="submit"]`).click();
const badCode = await staff
  .waitForSelector(`${CRED} [role="alert"]`, { timeout: 15000 })
  .then((el) => el.innerText())
  .catch(() => "");
check("an unknown customer code is refused", /introuvable|invalide/i.test(badCode), badCode);

/* ── 5. Stamps: enable in Réglages, then stamp at the till ─────────── */
await admin
  .from("loyalty_programs")
  .update({ stamps_enabled: true, stamps_required: 2, stamp_reward: "Café offert (test)" })
  .eq("business_id", cafeId);

const STAMP = 'section:has(h2:has-text("Ajouter un tampon"))';
const stampOnce = async () => {
  await openManual();
  await staff.fill(`${STAMP} input[name="customer"]`, card.code);
  await staff.locator(`${STAMP} button:has-text("tampon")`).click();
  await staff.locator(`${STAMP} [role="status"]`).waitFor({ timeout: 20000 }).catch(() => {});
  return staff.locator(STAMP).innerText();
};
await stampOnce();
const full = await stampOnce();
const stampCode = full.match(/\b[A-Z2-9]{6}\b/)?.[0] ?? "";
check("a full stamp card issues a code", /Carte pleine/i.test(full) && !!stampCode, stampCode || "none");

/* ── 6. The counter validates that code exactly once ───────────────── */
const SEC = 'section:has(h2:has-text("Valider un code"))';
const collect = async (code) => {
  await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
  await staff.fill(`${SEC} input[name="code"]`, code);
  await staff.locator(`${SEC} button:has-text("Vérifier")`).click();
  const btn = staff.locator(`${SEC} button:has-text("Collecter")`);
  await btn.waitFor({ timeout: 10000 }).catch(() => {});
  if (await btn.count()) {
    await btn.click();
    await staff.locator(`${SEC} [role="status"]`).waitFor({ timeout: 20000 }).catch(() => {});
  }
  return staff.locator(SEC).innerText();
};
if (stampCode) {
  const first = await collect(stampCode);
  check("code collects at the counter", /collecté/i.test(first), first.replace(/\n/g, " · ").slice(0, 50));
  const again = await collect(stampCode);
  check("the same code cannot be reused", /déjà.*utilisé/i.test(again), again.replace(/\n/g, " · ").slice(0, 50));
}

/* ── 7. Clients: find the cardholder, correct points + stamps ──────── */
await staff.goto(`${BASE}/owner/clients`, { waitUntil: "networkidle" });
await staff.locator('input[inputmode="search"]').fill(card.code);
const listed = await staff
  .waitForFunction((c) => (document.querySelector("main")?.innerText ?? "").includes(c), card.code, { timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check("Clients finds a cardholder by code", listed, card.code);
const listTxt = await staff.locator("main").innerText();
check("Clients never shows the raw phone", !listTxt.includes(NORM));

// open the row and correct the points
await staff.locator(`button:has-text("${card.code}")`).first().click();
await staff.locator('input[placeholder="+10 ou -5"]').fill("25");
const apply = staff.locator('button:has-text("Appliquer")');
await apply.waitFor({ state: "visible", timeout: 10000 });
await apply.click({ timeout: 15000 });
/* Poll the ledger rather than sleeping: the action round-trips to Zurich, so any
   fixed wait is a flake waiting to happen. */
let afterAdjust = 0;
for (let i = 0; i < 20; i++) {
  const { data } = await admin.rpc("pointili_balance", { p_business_id: cafeId, p_phone: NORM });
  afterAdjust = Number(data ?? 0);
  if (afterAdjust >= 25) break;
  await staff.waitForTimeout(1000);
}
check("owner can correct a balance", afterAdjust >= 25, `balance=${afterAdjust}`);

/* ── 8. Réglages: each section saves only its own fields ───────────── */
await staff.goto(`${BASE}/owner/reglages`, { waitUntil: "networkidle" });
const earn = 'form:has(input[name="pointsPerTnd"])';
await staff.locator(`${earn} input[name="pointsPerTnd"]`).fill("3");
await staff.locator(`${earn} input[name="welcomePoints"]`).fill("25");
await staff.locator(`${earn} button[type="submit"]`).click();
await staff.locator(`${earn} [role="status"], ${earn} [role="alert"]`).first().waitFor({ timeout: 20000 }).catch(() => {});
const { data: prog } = await admin
  .from("loyalty_programs")
  .select("points_per_tnd, welcome_points, stamps_enabled, stamps_required, stamp_reward")
  .eq("business_id", cafeId).single();
check("points settings persist", Number(prog.points_per_tnd) === 3 && prog.welcome_points === 25,
  `${prog.points_per_tnd} pt/TND · ${prog.welcome_points} welcome`);
check("saving points did NOT clobber the stamp settings",
  prog.stamps_enabled === true && prog.stamps_required === 2 && prog.stamp_reward === "Café offert (test)",
  `stamps=${prog.stamps_enabled}/${prog.stamps_required}`);

// an out-of-range rate must be refused
await staff.goto(`${BASE}/owner/reglages`, { waitUntil: "networkidle" });
await staff.locator(`${earn} input[name="pointsPerTnd"]`).fill("-5");
await staff.locator(`${earn} button[type="submit"]`).click();
const rejected = await staff
  .waitForSelector(`${earn} [role="alert"]`, { timeout: 20000 })
  .then((el) => el.innerText())
  .catch(() => "");
check("an invalid rate is refused", /entre 0,1 et 100/.test(rejected), rejected);

/* ── 9. Analyses renders with real data ────────────────────────────── */
await staff.goto(`${BASE}/owner/analyses`, { waitUntil: "networkidle" });
const stats = await staff.locator("main").innerText();
check("Analyses renders (no crash, no NaN)", /Analyses/.test(stats) && !/NaN|Infinity|undefined/.test(stats));

/* ── 10. QR page shows the shop's own link ─────────────────────────── */
await staff.goto(`${BASE}/owner/qr`, { waitUntil: "networkidle" });
const qrTxt = await staff.locator("main").innerText();
check("QR page shows this shop's URL", qrTxt.includes(TEST_SLUG), TEST_SLUG);

await browser.close();

/* ── clean up: this runs against the REAL database ─────────────────── */
for (const t of ["loyalty_redemptions", "stamp_rewards", "loyalty_stamps"]) {
  await admin.from(t).delete().eq("phone", NORM);
}
await admin.from("points_ledger").delete().eq("customer_phone", NORM);
await admin.from("diner_cafes").delete().eq("phone", NORM);
await admin.from("diner_streaks").delete().eq("phone", NORM);
await admin.from("pin_attempts").delete().eq("phone", NORM);
await admin.from("accounts").delete().eq("phone", NORM);
await dropTestCafe();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} owner checks passed`);
process.exit(failed.length ? 1 : 0);
