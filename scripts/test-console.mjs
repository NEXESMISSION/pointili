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
  Paths are real on both hosts: the till is /owner.
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
  await page.goto(`${APP}/owner/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});
};

/*
  ── THE DOOR ────────────────────────────────────────────────────────
  There is ONE sign-in. The console used to demand a second password behind a
  "ZONE SENSIBLE" screen with a 30-minute countdown; that is gone, so what
  guards the console now is the ROLE, checked in the layout AND re-checked by
  every admin_* RPC in Postgres.

  These assertions are what stands in its place. The console must open for a
  super-admin with nothing but their session, and must be invisible — not
  merely refused — to everyone else.
*/
const sa = await b.newPage({ viewport: { width: 390, height: 844 } });
await login(sa, SUPER.email, SUPER.password);
await sa.goto(`${APP}/admin`, { waitUntil: "networkidle" });
check(
  "one sign-in opens the console — no second password",
  new URL(sa.url()).pathname === "/admin",
  new URL(sa.url()).pathname,
);

const consoleTxt = await sa.locator("body").innerText();
check("the console shows the work queue", /À traiter/i.test(consoleTxt));
check("the console does not shout", !/ZONE SENSIBLE|Confirmez votre mot de passe/i.test(consoleTxt));

// the owner app must not advertise it
await sa.goto(`${APP}/owner`, { waitUntil: "networkidle" });
const navHtml = await sa.locator("nav").last().innerHTML();
check("owner nav does not link the console", !navHtml.includes("/admin"));

// the old step-up door is gone for good
const goneRes = await sa.goto(`${APP}/admin/login`, { waitUntil: "networkidle" });
check("the old step-up screen is gone", goneRes?.status() === 404, `status=${goneRes?.status()}`);

// ── 7. a plain owner learns nothing ─────────────────────────────────
const email = `plain${Date.now()}@example.com`;
const pw = "Test-12345678";
const { data: made } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
const plain = await b.newPage();
await login(plain, email, pw);
const res = await plain.goto(`${APP}/admin`, { waitUntil: "networkidle" });
check("plain owner gets 404 on the console", res?.status() === 404, `status=${res?.status()}`);

// ── 7b. a PLATFORM OPERATOR is not a shop ───────────────────────────
/*
  A super-admin with no café of their own is the normal shape for an operator
  account. Every screen in the owner app used to answer "no café" with
  "créez votre café", so an operator was trapped on a shop-creation form with
  no way out but to create a junk café.
*/
{
  const opEmail = `operator-${Date.now()}@example.com`;
  const opPw = "Operator-12345678";
  const { data: opMade } = await admin.auth.admin.createUser({
    email: opEmail, password: opPw, email_confirm: true,
  });
  await admin.from("profiles").upsert(
    { id: opMade.user.id, email: opEmail, role: "super_admin" },
    { onConflict: "id" },
  );

  const op = await b.newPage({ viewport: { width: 390, height: 844 } });
  await login(op, opEmail, opPw);
  const landed = new URL(op.url()).pathname;
  check("an operator with no café is not sent to café setup",
    !landed.startsWith("/owner/nouveau"), landed);

  await op.goto(`${APP}/owner`, { waitUntil: "networkidle" });
  check("the till redirects an operator to the console",
    new URL(op.url()).pathname.startsWith("/admin"), new URL(op.url()).pathname);

  await op.close();
  await admin.auth.admin.deleteUser(opMade.user.id);
}

// ── 8. an unelevated action fails closed at the server ──────────────
// Read whatever café exists — this only asserts the forged POST changed nothing.
const { rows: [target] } = await sql.query(`select id, plan from businesses order by created_at limit 1`);
const before = target?.plan;
const forged = await plain.evaluate(async (base) => {
  const r = await fetch(base + "/admin", { method: "POST", body: new URLSearchParams({ plan: "free" }) });
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
