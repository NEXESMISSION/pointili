/**
 * The platform layer, end to end: subscriptions, suspension, notices, and the
 * super-admin boundary. Exits non-zero on failure.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { connect, env, onExit } from "./db.mjs";
import { ensureTestCafe, dropTestCafe, TEST_SLUG } from "./fixture.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SUPER = { email: env.SUPER_ADMIN_EMAIL, password: env.SUPER_ADMIN_PASSWORD };
const SLUG = TEST_SLUG;

// Own our fixture: a throwaway café to grant/expire/suspend, gone at the end.
/*
  The café is owned by the SUPER-ADMIN here on purpose — this suite checks what
  the owner app does for somebody who also has a console — so the fixture is
  being pointed at a real address. It refuses to rotate a password it did not
  mint (see ensureTestOwner), and the escape hatch is to supply the one we
  already have: OWNER_PASSWORD. Set before the fixture is called, never after.
*/
process.env.OWNER_PASSWORD ??= env.SUPER_ADMIN_PASSWORD;
await ensureTestCafe({ ownerEmail: SUPER.email });

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/*
  ── WAIT FOR OUR OWN RESULT LINE, NOT FOR ANY LIVE REGION ─────────────────

  These waits were '[role="status"], [role="alert"]'. In development Next.js
  mounts an empty <div role="alert"> for its error overlay, so that selector
  matched something that was ALREADY on the page: every wait resolved instantly,
  the suite read the database before the server action had landed, and eight
  checks failed with values that looked like real regressions ("trial → trial,
  +0 days"). It only worked before because the old console put every control in
  a modal, and the wait was scoped to that dialog.

  The console's own result lines are always <p> (see Result in ShopControls), so
  naming the element is enough — and it stays honest if the overlay changes,
  because a <div> can never satisfy it.
*/
const RESULT = 'p[role="status"], p[role="alert"]';

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const sql = await connect();
const b = await chromium.launch({ executablePath: CHROME });


/*
  ── EVERY PAGE IN THIS FILE READS FRENCH ─────────────────────────────────
  The product's default language is TUNISIAN (lib/i18n: absent cookie → "tn").
  Every check below asserts French copy, so the language has to be STATED here
  rather than inherited from whatever the default happens to be this month —
  otherwise the suite goes red on a product change that is entirely correct.

  Same convention as scripts/test-client.mjs, which hit this first.
*/
const LANG_FR = { name: "pointili_lang", value: "fr", url: BASE };
const newFrenchPage = async (target, opts) => {
  const page = await target.newPage(opts);
  await page.context().addCookies([LANG_FR]);
  return page;
};

const login = async (page, email, password) => {
  await page.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});
};

/**
 * Signing in IS enough to reach the console — the step-up screen is gone. The
 * role is the gate, checked in the layout and re-checked by every admin_* RPC
 * in Postgres. scripts/test-console.mjs guards that boundary itself.
 */
const openConsole = async (page) => {
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
};

// ── 1. super-admin reaches /admin ───────────────────────────────────
const sa = await newFrenchPage(b, { viewport: { width: 390, height: 844 } });
await login(sa, SUPER.email, SUPER.password);
await openConsole(sa);
check("super-admin reaches /admin with one sign-in", new URL(sa.url()).pathname === "/admin", new URL(sa.url()).pathname);
/*
  THE ROSTER MOVED, AND SO DID THIS CHECK.

  It used to read /admin, because /admin was everything — the queue, the table,
  the traffic and the log in one scroll. The front page is now only what needs a
  decision, so a café that is perfectly healthy is CORRECTLY absent from it; the
  list of every shop lives at /admin/cafes.

  Still asserted on the café this suite provisions ("Café Test") rather than on
  a real one: the admin query has no owner filter, so the fixture appearing
  proves the roster lists every café, and no live café's name is hardcoded into
  a test that would drift as the data changes.
*/
await sa.goto(`${BASE}/admin/cafes`, { waitUntil: "networkidle" });
const adminTxt = await sa.locator("main").innerText();
check("the roster lists every café", /Café Test/.test(adminTxt), adminTxt.slice(0, 40).replace(/\n/g, " "));

// ── 2. a plain owner is bounced ─────────────────────────────────────
const email = `plain${Date.now()}@example.com`;
const pw = "Test-12345678";
const { data: made } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
// deleted here AND on failure — a suite that throws used to leave a live account
onExit(() => admin.auth.admin.deleteUser(made.user.id));
const plain = await newFrenchPage(b);
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
/*
  ── A CAFÉ IS AN ADDRESS NOW, NOT A ROW THAT OPENS A DRAWER ───────────────

  This used to click `tr:has-text("/<slug>")` on /admin and wait for
  [role="dialog"]. The console is many pages and a café has one of its own, so
  there is no modal — and no row to hunt for in a table that may be filtered,
  sorted or paged away from the fixture.

  BY ID, FROM THE DATABASE. Earlier still it clicked `tr:has-text("Café Test")`,
  and a real café in this database is ALSO called "Café Test" — /coffeelain —
  which sorts above the fixture. Every run granted plans to, suspended and
  messaged somebody's live shop while asserting against a fixture that never
  changed. Resolving the id in SQL makes landing on the wrong café impossible
  rather than unlikely.

  The full plan form is folded behind "Autre durée…", because the common case is
  the one-tap +6 mois / +1 an buttons; the checks below drive the arbitrary
  amount/unit fields, so it is opened on the way in.
*/
const openCafe = async (slug = SLUG) => {
  const { rows } = await sql.query(`select id from businesses where slug = $1`, [slug]);
  await sa.goto(`${BASE}/admin/cafes/${rows[0].id}`, { waitUntil: "networkidle" });
  const custom = sa.locator('button:has-text("Autre durée")');
  if (await custom.count()) await custom.first().click();
  await sa.locator('select[name="unit"]').first().waitFor({ timeout: 15000 });
  return sa;
};

const before = (await sql.query(`select plan, plan_expires_at from businesses where slug='${SLUG}'`)).rows[0];
const demoRow = await openCafe();
const planForm = demoRow.locator('form:has(select[name="plan"])');
await planForm.locator('select[name="plan"]').selectOption("pro");
await planForm.locator('input[name="amount"]').fill("3");
await planForm.locator('select[name="unit"]').selectOption("months");
await planForm.locator('button[type="submit"]').click();
await demoRow.locator(RESULT).first().waitFor({ timeout: 20000 }).catch(() => {});
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

const diner = await newFrenchPage(b, { viewport: { width: 390, height: 844 } });
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
  const r = await openCafe();
  const f = r.locator('form:has(select[name="unit"])');
  await f.locator('select[name="plan"]').selectOption("pro");
  await f.locator('input[name="amount"]').fill("12");
  await f.locator('select[name="unit"]').selectOption("hours");
  await f.locator('button[type="submit"]').click();
  await r.locator(RESULT).first().waitFor({ timeout: 20000 }).catch(() => {});

  const { rows } = await sql.query(
    `select round(extract(epoch from (plan_expires_at - now())) / 3600)::int as hours
       from businesses where slug='${SLUG}'`,
  );
  check("plan can be granted in HOURS", rows[0].hours === 12, `+${rows[0].hours} h`);

  // and days
  await sql.query(`update businesses set plan_expires_at = now() where slug='${SLUG}'`);
  const r2 = await openCafe();
  const f2 = r2.locator('form:has(select[name="unit"])');
  await f2.locator('input[name="amount"]').fill("5");
  await f2.locator('select[name="unit"]').selectOption("days");
  await f2.locator('button[type="submit"]').click();
  await r2.locator(RESULT).first().waitFor({ timeout: 20000 }).catch(() => {});
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
const row2 = await openCafe();
/*
  NO dialog handler any more, and its absence is the assertion.

  Suspending used to pop a window.confirm() — a browser dialog dismissed by
  muscle memory, guarding the one control here that takes a paying shop's
  customers offline instantly. The guard is the reason field now: the button is
  inert until one is typed, so the deliberate act and the audit record are the
  same keystrokes. If a confirm() ever comes back, this click hangs and this
  suite says so.
*/
const susForm = row2.locator('form:has(input[name="reason"])');
await susForm.locator('input[name="reason"]').fill("test suspension");
await susForm.locator('button[type="submit"]').click();
await row2.locator(RESULT).first().waitFor({ timeout: 20000 }).catch(() => {});

const suspended = (await sql.query(`select suspended_at from businesses where slug='${SLUG}'`)).rows[0];
check("super-admin suspends a café from the panel", suspended.suspended_at !== null);

await diner.goto(`${BASE}/${SLUG}`, { waitUntil: "networkidle" });
check("suspended café blocks diners", /Momentanément fermé/i.test(await diner.locator("body").innerText()));

// unsuspend via the panel too
const row3 = await openCafe();
await row3.locator('form:has(input[name="suspend"][value="0"]) button[type="submit"]').click();
await row3.locator(RESULT).first().waitFor({ timeout: 20000 }).catch(() => {});
const back = (await sql.query(`select suspended_at from businesses where slug='${SLUG}'`)).rows[0];
check("super-admin lifts the suspension", back.suspended_at === null);

// ── 8. notices reach the owner ──────────────────────────────────────
const row4 = await openCafe();
const noticeForm = row4.locator('form:has(textarea[name="message"])');
await noticeForm.locator('textarea[name="message"]').fill("Test notice for the owner");
await noticeForm.locator('button[type="submit"]').click();
await row4.locator(RESULT).first().waitFor({ timeout: 20000 }).catch(() => {});
/*
  ── ASSERTED ON THE CAFÉ IT WAS SENT TO, NOT ON /owner ───────────────────
  This used to post a notice to the TEST café and then look for it on the
  super-admin's own /owner page. That only works if the operator owns exactly
  one shop — ownerCafe() resolves `order by created_at limit 1`, so the moment
  the super-admin owns anything older than the test café (they own one), /owner
  renders THAT shop and the notice can never appear there.

  It is not a product bug: a notice addressed to shop A correctly does not show
  on shop B's dashboard. The check was reading the wrong screen, and it went
  unnoticed because the suite crashed before reaching it.

  So it asks the same question the owner's dashboard asks — owner_notices, with
  the shop and its owner — which is the path being tested, minus the guess
  about which café /owner picks.
*/
const { rows: noticeRows } = await sql.query(
  `select owner_notices(b.id, b.owner_id) as n from businesses b where b.slug = $1`,
  [SLUG],
);
check(
  "owner sees the notice",
  (noticeRows[0]?.n ?? []).some((n) => n.message === "Test notice for the owner"),
);

// ── 9. everything privileged is written down ────────────────────────
const audit = (await sql.query(`select count(*)::int as n from admin_audit`)).rows[0];
check("privileged actions are audited", audit.n > 0, `${audit.n} entries`);

// cleanup — drop the fixture café (cascades its notices/ledger/subscription)
await sql.query(`delete from platform_notices where message = 'Test notice for the owner'`);
/* Registered as well as called: a suite that throws before this line used to
   leave a live, sign-in-able account in the production database. */
await admin.auth.admin.deleteUser(made.user.id);
await sql.end();
await b.close();
await dropTestCafe();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} platform checks passed`);
process.exit(failed.length ? 1 : 0);
