/**
 * The platform layer, end to end: subscriptions, suspension, notices, and the
 * super-admin boundary. Exits non-zero on failure.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { connect, env } from "./db.mjs";
import { ensureTestCafe, dropTestCafe, TEST_SLUG } from "./fixture.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SUPER = { email: env.SUPER_ADMIN_EMAIL, password: env.SUPER_ADMIN_PASSWORD };
const SLUG = TEST_SLUG;

// Own our fixture: a throwaway café to grant/expire/suspend, gone at the end.
await ensureTestCafe({ ownerEmail: SUPER.email });

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const sql = await connect();
const b = await chromium.launch({ executablePath: CHROME });

const login = async (page, email, password) => {
  await page.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});
};

/**
 * Signing in is no longer enough to reach the console — it needs a step-up
 * re-auth (see scripts/test-console.mjs for that boundary itself).
 */
const elevate = async (page, password) => {
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  if (new URL(page.url()).pathname === "/admin/login") {
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => u.pathname === "/admin", { timeout: 20000 }).catch(() => {});
  }
};

// ── 1. super-admin reaches /admin ───────────────────────────────────
const sa = await b.newPage({ viewport: { width: 390, height: 844 } });
await login(sa, SUPER.email, SUPER.password);
await elevate(sa, SUPER.password);
check("elevated super-admin reaches /admin", new URL(sa.url()).pathname === "/admin", new URL(sa.url()).pathname);
const adminTxt = await sa.locator("main").innerText();
check("admin lists every café", /Café Test/.test(adminTxt) && /saif coffe/.test(adminTxt));

// ── 2. a plain owner is bounced ─────────────────────────────────────
const email = `plain${Date.now()}@example.com`;
const pw = "Test-12345678";
const { data: made } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
const plain = await b.newPage();
await login(plain, email, pw);
const plainRes = await plain.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
check(
  "plain owner cannot reach /admin",
  plainRes?.status() === 404 || !new URL(plain.url()).pathname.startsWith("/admin"),
  `status=${plainRes?.status()} path=${new URL(plain.url()).pathname}`,
);

// ── 3. the RPCs refuse a non-super-admin even if called directly ────
const asOwner = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
await asOwner.auth.signInWithPassword({ email, password: pw });
const { data: bizRow } = await admin.from("businesses").select("id").eq("slug", SLUG).single();
const direct = await asOwner.rpc("admin_set_plan", { p_business_id: bizRow.id, p_plan: "pro", p_months: 99 });
check("admin RPC refuses a non-super-admin", !!direct.error, direct.error?.code ?? "SUCCEEDED — HOLE");

/*
  ── 4. subscription: grant pro through the UI ───────────────────────
  Driven through the real panel, not raw SQL: admin_set_plan() checks
  pointili_is_super_admin(), which reads auth.uid() — null on a direct psql
  connection, so SQL calls are (correctly) refused. The UI is the real path.
*/
const before = (await sql.query(`select plan, plan_expires_at from businesses where slug='${SLUG}'`)).rows[0];
await sa.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
const demoRow = sa.locator('li:has-text("Café Test")');
await demoRow.locator("button").first().click(); // expand
const planForm = demoRow.locator('form:has(select[name="plan"])');
await planForm.locator('select[name="plan"]').selectOption("pro");
await planForm.locator('input[name="amount"]').fill("3");
await planForm.locator('select[name="unit"]').selectOption("months");
await planForm.locator('button[type="submit"]').click();
await demoRow.locator('[role="status"], [role="alert"]').first().waitFor({ timeout: 20000 }).catch(() => {});
const after = (await sql.query(`select plan, plan_expires_at from businesses where slug='${SLUG}'`)).rows[0];
check(
  "super-admin grants a 3-month pro plan",
  after.plan === "pro" && new Date(after.plan_expires_at) > new Date(before.plan_expires_at),
  `${before.plan} → ${after.plan}, +${Math.round((new Date(after.plan_expires_at) - new Date(before.plan_expires_at)) / 86400000)} days`,
);

// ── 5. an expired plan takes the café offline ───────────────────────
await sql.query(`update businesses set plan_expires_at = now() - interval '1 day' where slug='${SLUG}'`);
const liveNow = (await sql.query(`select cafe_is_live(id) as live from businesses where slug='${SLUG}'`)).rows[0];
check("expired plan → café not live", liveNow.live === false);

const diner = await b.newPage({ viewport: { width: 390, height: 844 } });
await diner.goto(`${BASE}/${SLUG}`, { waitUntil: "networkidle" });
const darkTxt = await diner.locator("body").innerText();
check("expired café shows a real message, not a 404", /Momentanément fermé/i.test(darkTxt));

// the money paths must be shut, not just the UI
const play = await diner.evaluate(async (slug) => {
  const r = await fetch("/api/play", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug }),
  });
  return r.status;
}, SLUG);
check("expired café cannot be played", play !== 200, `status=${play}`);

const credit = (await sql.query(
  `select credit_points((select id from businesses where slug='${SLUG}'), '+21600000001', 100) as r`,
)).rows[0].r;
check("expired café cannot mint points", credit.ok === false, credit.reason);

// ── 5b. hours and days, not just months ─────────────────────────────
{
  await sql.query(`update businesses set plan_expires_at = now() where slug='${SLUG}'`);
  await sa.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const r = sa.locator("li").filter({ hasText: "Café Test" }).first();
  await r.locator("button").first().click();
  const f = r.locator('form:has(select[name="unit"])');
  await f.locator('select[name="plan"]').selectOption("pro");
  await f.locator('input[name="amount"]').fill("12");
  await f.locator('select[name="unit"]').selectOption("hours");
  await f.locator('button[type="submit"]').click();
  await r.locator('[role="status"], [role="alert"]').first().waitFor({ timeout: 20000 }).catch(() => {});

  const { rows } = await sql.query(
    `select round(extract(epoch from (plan_expires_at - now())) / 3600)::int as hours
       from businesses where slug='${SLUG}'`,
  );
  check("plan can be granted in HOURS", rows[0].hours === 12, `+${rows[0].hours} h`);

  // and days
  await sql.query(`update businesses set plan_expires_at = now() where slug='${SLUG}'`);
  await sa.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const r2 = sa.locator("li").filter({ hasText: "Café Test" }).first();
  await r2.locator("button").first().click();
  const f2 = r2.locator('form:has(select[name="unit"])');
  await f2.locator('input[name="amount"]').fill("5");
  await f2.locator('select[name="unit"]').selectOption("days");
  await f2.locator('button[type="submit"]').click();
  await r2.locator('[role="status"], [role="alert"]').first().waitFor({ timeout: 20000 }).catch(() => {});
  const { rows: d } = await sql.query(
    `select round(extract(epoch from (plan_expires_at - now())) / 86400)::int as days
       from businesses where slug='${SLUG}'`,
  );
  check("plan can be granted in DAYS", d[0].days === 5, `+${d[0].days} j`);
}

// ── 6. restore, and the café comes straight back ────────────────────
await sql.query(`update businesses set plan_expires_at = now() + interval '30 days' where slug='${SLUG}'`);
await diner.goto(`${BASE}/${SLUG}`, { waitUntil: "networkidle" });
check("renewing brings the café back", !/Momentanément fermé/i.test(await diner.locator("body").innerText()));

// ── 7. suspension through the UI cuts access immediately ────────────
await sa.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
const row2 = sa.locator('li:has-text("Café Test")');
await row2.locator("button").first().click();
sa.once("dialog", (d) => d.accept()); // "les clients perdront l'accès"
const susForm = row2.locator('form:has(input[name="reason"])');
await susForm.locator('input[name="reason"]').fill("test suspension");
await susForm.locator('button[type="submit"]').click();
await row2.locator('[role="status"], [role="alert"]').first().waitFor({ timeout: 20000 }).catch(() => {});

const suspended = (await sql.query(`select suspended_at from businesses where slug='${SLUG}'`)).rows[0];
check("super-admin suspends a café from the panel", suspended.suspended_at !== null);

await diner.goto(`${BASE}/${SLUG}`, { waitUntil: "networkidle" });
check("suspended café blocks diners", /Momentanément fermé/i.test(await diner.locator("body").innerText()));

// unsuspend via the panel too
await sa.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
const row3 = sa.locator('li:has-text("Café Test")');
await row3.locator("button").first().click();
await row3.locator('form:has(input[name="suspend"][value="0"]) button[type="submit"]').click();
await row3.locator('[role="status"], [role="alert"]').first().waitFor({ timeout: 20000 }).catch(() => {});
const back = (await sql.query(`select suspended_at from businesses where slug='${SLUG}'`)).rows[0];
check("super-admin lifts the suspension", back.suspended_at === null);

// ── 8. notices reach the owner ──────────────────────────────────────
await sa.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
const row4 = sa.locator('li:has-text("Café Test")');
await row4.locator("button").first().click();
const noticeForm = row4.locator('form:has(textarea[name="message"])');
await noticeForm.locator('textarea[name="message"]').fill("Test notice for the owner");
await noticeForm.locator('button[type="submit"]').click();
await row4.locator('[role="status"], [role="alert"]').first().waitFor({ timeout: 20000 }).catch(() => {});
await sa.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
check("owner sees the notice", /Test notice for the owner/.test(await sa.locator("body").innerText()));

// ── 9. everything privileged is written down ────────────────────────
const audit = (await sql.query(`select count(*)::int as n from admin_audit`)).rows[0];
check("privileged actions are audited", audit.n > 0, `${audit.n} entries`);

// cleanup — drop the fixture café (cascades its notices/ledger/subscription)
await sql.query(`delete from platform_notices where message = 'Test notice for the owner'`);
await admin.auth.admin.deleteUser(made.user.id);
await sql.end();
await b.close();
await dropTestCafe();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} platform checks passed`);
process.exit(failed.length ? 1 : 0);
