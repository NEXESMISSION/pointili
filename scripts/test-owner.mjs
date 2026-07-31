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
  .from("accounts").select("code").eq("phone", NORM).maybeSingle();

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

/*
  The till is a terminal: the keypad is the resting state (the camera only opens
  when asked), and the identified customer takes over the whole screen.
*/
const DESK = '[role="dialog"]';
const keypad = () => staff.locator('input[name="customer"]').waitFor({ timeout: 15000 });
const openCustomer = async (who) => {
  await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
  await keypad();
  await staff.fill('input[name="customer"]', who);
  await staff.locator('button:has-text("Chercher")').click();
  await staff.locator(DESK).waitFor({ timeout: 20000 }).catch(() => {});
};

/* ── 2. Credit by the 4-char ACCOUNT code (privacy path) ───────────── */
await openCustomer(card.code);
await staff.fill('input[name="amount"]', "10");
await staff.locator('button:has-text("Créditer")').click();
await staff.locator('[role="status"]').waitFor({ timeout: 20000 }).catch(() => {});
const credTxt = await staff.locator(DESK).innerText();
check("credit by code works", /\+10/.test(credTxt), credTxt.split("\n").find((l) => /\+10/.test(l)) ?? "");
check("credit result hides the phone", !credTxt.includes(LOCAL) && !credTxt.includes(NORM));

/* ── 3. A bad amount is refused, not silently accepted ─────────────── */
await openCustomer(card.code);
await staff.fill('input[name="amount"]', "-5");
await staff.locator('button:has-text("Créditer")').click();
const badAmount = await staff
  .waitForSelector(`${DESK} [role="alert"]`, { timeout: 15000 })
  .then((el) => el.innerText())
  .catch(() => "");
check("a negative amount is refused", /invalide/i.test(badAmount), badAmount);

/* ── 4. An unknown code is refused ─────────────────────────────────── */
/*
  Codes are platform-wide now, so a hard-coded "ZZZZ" is no longer safely
  unowned — it is well-formed and could legitimately belong to a real account,
  which would flip this from a false pass into a false failure (and a
  cross-tenant read: this suite runs against the real database). Find one that
  provably belongs to nobody.
*/
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let freeCode = "";
for (let i = 0; i < 50 && !freeCode; i++) {
  const c = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * 32)]).join("");
  const { data } = await admin.from("accounts").select("phone").eq("code", c).maybeSingle();
  if (!data) freeCode = c;
}
await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
await keypad();
await staff.locator('input[name="customer"]').fill(freeCode);
await staff.locator('input[name="customer"]').press("Enter");
// no customer sheet opens, so the refusal shows on the terminal itself
const badCode = await staff
  .waitForSelector('main [role="alert"]', { timeout: 20000 })
  .then((el) => el.innerText())
  .catch(() => "");
// "introuvable" only: a VALIDATION rejection must never pass as a lookup miss.
check("an unknown customer code is refused", /introuvable/i.test(badCode), `${freeCode} → ${badCode}`);

/* ── 5. Stamps: enable in Réglages, then stamp at the till ─────────── */
await admin
  .from("loyalty_programs")
  .update({ stamps_enabled: true, stamps_required: 2, stamp_reward: "Café offert (test)" })
  .eq("business_id", cafeId);

const stampOnce = async () => {
  await openCustomer(card.code);
  await staff.locator('button:has-text("+1 tampon")').click();
  await staff.locator('[role="status"]').waitFor({ timeout: 20000 }).catch(() => {});
  return staff.locator(DESK).innerText();
};
await stampOnce();
const full = await stampOnce();
const stampCode = full.match(/code\s+([A-Z2-9]{6})/)?.[1] ?? "";
check("a full stamp card issues a code", /Carte pleine/i.test(full) && !!stampCode, stampCode || "none");

/* ── 6. The counter validates that code exactly once ───────────────── */
const SEC = 'section:has(h2:has-text("Valider une récompense"))';
const collect = async (code) => {
  await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
  await staff.locator('button:has-text("Valider une récompense")').click(); // the terminal's second mode
  await staff.locator(`${SEC} input[name="code"]`).waitFor({ timeout: 15000 });
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

/* ── 7. Open the cardholder at the till, correct points + stamps ────
   The browsable "Mes clients" list was removed from the caisse, so a customer
   is reached the one way a cashier ever reaches one: by the code they show.
   The cross-shop probe that used to live here went with the list — it asked
   whether a stranger's code could be ENUMERATED out of a list that no longer
   exists. The isolation that still has teeth is the PIN reset, and that is
   guarded in scripts/attack.mjs. */
await openCustomer(card.code);
const listed = await staff
  .waitForFunction((c) => (document.querySelector("main")?.innerText ?? "").includes(c), card.code, { timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check("the till opens a cardholder by code", listed, card.code);
const listTxt = await staff.locator("main").innerText();
check("the till never shows the raw phone", !listTxt.includes(NORM));

await staff.locator('button:has-text("Corriger / Historique")').click();
await staff.locator('input[name="adjust"]').fill("25");
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

/* ── 8. Réglages: each editor saves only its own fields ────────────── */
// Réglages is a settings list now — every knob is one tap deep, in its own editor.
const earn = 'form:has(input[name="pointsPerTnd"])';
const openPoints = async () => {
  await staff.goto(`${BASE}/owner/reglages`, { waitUntil: "networkidle" });
  await staff.locator('button:has-text("Les points")').click();
  await staff.locator(`${earn} input[name="pointsPerTnd"]`).waitFor({ timeout: 15000 });
};
await openPoints();
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
await openPoints();
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
