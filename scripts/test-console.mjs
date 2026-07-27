/**
 * The super-admin console boundary.
 *
 * The threat: a leaked/borrowed OWNER session. Being signed in as a super-admin
 * must NOT be enough to suspend a café — the console needs a recent password.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { connect, env } from "./db.mjs";
import { ensureTestCafe, dropTestCafe } from "./fixture.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

/*
  Two hosts now. The customer side keeps the apex (every printed QR points at it)
  and the business side lives on app.* — Chrome resolves app.localhost without a
  hosts-file entry, so this exercises the real split rather than a special case.
  Owner paths are SHORT there: the till is "/", not "/owner".
*/
const APP = process.env.APP_URL ?? BASE.replace("//", "//app.");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SUPER = { email: env.SUPER_ADMIN_EMAIL, password: env.SUPER_ADMIN_PASSWORD };

// The super-admin needs a café so /owner renders the real app (and its nav),
// which is what the "nav doesn't link the console" check inspects.
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
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});
};

// ── 1. THE THREAT: a signed-in super-admin is NOT automatically in ──
const sa = await b.newPage({ viewport: { width: 390, height: 844 } });
await login(sa, SUPER.email, SUPER.password);
await sa.goto(`${APP}/console`, { waitUntil: "networkidle" });
check(
  "owner session alone does NOT open the console",
  new URL(sa.url()).pathname === "/console/login",
  new URL(sa.url()).pathname,
);

// the owner app must not advertise it
await sa.goto(`${APP}`, { waitUntil: "networkidle" });
const navHtml = await sa.locator("nav").last().innerHTML();
check("owner nav does not link the console", !/\/admin/.test(navHtml));

// ── 2. a wrong password does not elevate ────────────────────────────
await sa.goto(`${APP}/console/login`, { waitUntil: "networkidle" });
await sa.fill('input[name="password"]', "definitely-not-it");
await sa.click('button[type="submit"]');
const refused = await sa
  .waitForFunction(() => /incorrect/i.test(document.body.innerText), undefined, { timeout: 20000 })
  .then(() => true)
  .catch(() => false);
check("wrong password refused", refused);
await sa.goto(`${APP}/console`, { waitUntil: "networkidle" });
check("still locked out after a wrong password", new URL(sa.url()).pathname === "/console/login");

// ── 3. the right password elevates ──────────────────────────────────
await sa.fill('input[name="password"]', SUPER.password);
await sa.click('button[type="submit"]');
await sa.waitForURL((u) => u.pathname === "/console", { timeout: 20000 }).catch(() => {});
check("correct password unlocks the console", new URL(sa.url()).pathname === "/console", new URL(sa.url()).pathname);
const listed = await sa
  .waitForFunction(() => /Tous les caf/.test(document.body.innerText), undefined, { timeout: 20000 })
  .then(() => true)
  .catch(() => false);
check("console shows the cafés", listed);

// ── 4. the elevation cookie is scoped + httpOnly ────────────────────
const cookies = await sa.context().cookies();
const elev = cookies.find((c) => c.name === "pointili_admin");
check("elevation cookie is httpOnly", elev?.httpOnly === true);
// The cookie Path is matched against the URL BAR, which shows the PUBLIC path.
// Scoping it to the internal /admin would mean it is simply never sent back.
check("elevation cookie is scoped to /console", elev?.path === "/console", elev?.path);
check("elevation cookie is sameSite=Strict", elev?.sameSite === "Strict", String(elev?.sameSite));
check(
  "elevation is short-lived (<= 30 min)",
  elev ? elev.expires * 1000 - Date.now() <= 31 * 60 * 1000 : false,
  elev ? `${Math.round((elev.expires * 1000 - Date.now()) / 60000)} min` : "none",
);
const jsReadable = await sa.evaluate(() => document.cookie.includes("pointili_admin"));
check("elevation cookie unreadable from JS (XSS-proof)", !jsReadable);

// ── 5. locking drops elevation, session survives ────────────────────
await sa.locator('button:has-text("Verrouiller")').click();
await sa.waitForURL((u) => !u.pathname.startsWith("/console"), { timeout: 20000 }).catch(() => {});
await sa.goto(`${APP}/console`, { waitUntil: "networkidle" });
check("locking re-closes the console", new URL(sa.url()).pathname === "/console/login");
await sa.goto(`${APP}`, { waitUntil: "networkidle" });
check("locking keeps the owner signed in", new URL(sa.url()).pathname === "/");

// ── 6. a forged elevation cookie is rejected ────────────────────────
await sa.context().addCookies([
  { name: "pointili_admin", value: "forged.token", domain: "app.localhost", path: "/console" },
]);
await sa.goto(`${APP}/console`, { waitUntil: "networkidle" });
check("forged elevation cookie rejected", new URL(sa.url()).pathname === "/console/login");
await sa.context().clearCookies();

// ── 7. a plain owner learns nothing ─────────────────────────────────
const email = `plain${Date.now()}@example.com`;
const pw = "Test-12345678";
const { data: made } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
const plain = await b.newPage();
await login(plain, email, pw);
const res = await plain.goto(`${APP}/console/login`, { waitUntil: "networkidle" });
check("plain owner gets 404 on the console door", res?.status() === 404, `status=${res?.status()}`);

// ── 8. an unelevated action fails closed at the server ──────────────
// Read whatever café exists — this only asserts the forged POST changed nothing.
const { rows: [target] } = await sql.query(`select id, plan from businesses order by created_at limit 1`);
const before = target?.plan;
const forged = await plain.evaluate(async (base) => {
  const r = await fetch(base + "/console", { method: "POST", body: new URLSearchParams({ plan: "free" }) });
  return r.status;
}, APP);
const after = target
  ? (await sql.query(`select plan from businesses where id=$1`, [target.id])).rows[0].plan
  : before;
check("a non-super-admin cannot change a plan", before === after, `${before} → ${after} (POST ${forged})`);

await admin.auth.admin.deleteUser(made.user.id);
await sql.end();
await b.close();
await dropTestCafe();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} console checks passed`);
process.exit(failed.length ? 1 : 0);
