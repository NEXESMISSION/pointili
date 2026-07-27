/** Walk-in: credit a phone with NO account, then sign up and find the points. */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { env } from "./db.mjs";
import { ensureTestCafe, dropTestCafe, TEST_SLUG } from "./fixture.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

/*
  Two hosts now. The customer side keeps the apex (every printed QR points at it)
  and the business side lives on app.* — Chrome resolves app.localhost without a
  hosts-file entry, so this exercises the real split rather than a special case.
  Owner paths are SHORT there: the till is "/", not "/owner".
*/
const APP = process.env.APP_URL ?? BASE.replace("//", "//app.");
const LOCAL = `2${String(Date.now()).slice(-7)}`;
const NORM = `+216${LOCAL}`;

const ok = [];
const t = (n, p, d = "") => { ok.push(p); console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); };

await ensureTestCafe({ ownerEmail: env.SUPER_ADMIN_EMAIL });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const b = await chromium.launch({ executablePath: CHROME });
const s = await b.newPage({ viewport: { width: 390, height: 844 } });
await s.goto(`${APP}/login`, { waitUntil: "networkidle" });
await s.fill('input[name="email"]', env.SUPER_ADMIN_EMAIL);
await s.fill('input[name="password"]', env.SUPER_ADMIN_PASSWORD);
await s.click('button[type="submit"]');
await s.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});

/* 1 · credit a phone that has NEVER signed up */
// The terminal rests on the keypad, which is where a phone number gets typed.
const DESK = '[role="dialog"]';
await s.goto(`${APP}`, { waitUntil: "networkidle" });
await s.locator('input[name="customer"]').waitFor({ timeout: 15000 });
await s.fill('input[name="customer"]', LOCAL);
await s.locator('button:has-text("Chercher")').click();
const panel = await s.locator(DESK).waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
t("the till opens a customer with no account", panel);

const deskTxt = await s.locator(DESK).innerText();
// "enrolled" now means "holds a card HERE", so the wording is about this shop,
// not about the platform — they may already be a Pointili member elsewhere.
t("it says this is their first visit here", /première visite ici/i.test(deskTxt),
  deskTxt.split("\n").find((l) => /visite/i.test(l)) ?? "");

await s.fill('input[name="amount"]', "30");
await s.locator('button:has-text("Créditer")').click();
await s.locator('[role="status"]').waitFor({ timeout: 20000 }).catch(() => {});
const credTxt = await s.locator(DESK).innerText();
t("credit works before signup", /\+30/.test(credTxt), credTxt.split("\n").find((l) => /\+30/.test(l)) ?? "");

const { data: acc } = await admin.from("accounts").select("phone, code").eq("phone", NORM).maybeSingle();
t("no ghost account was invented", !acc);
// No account ⇒ no code. That is now the load-bearing invariant: a mistyped digit
// must never mint a platform identity.
t("a walk-in is reachable by no code at all", !acc?.code);

/* 2 · the walk-in is visible in the client list */
await s.goto(`${APP}`, { waitUntil: "networkidle" });
await s.locator('input[name="search"]').fill(LOCAL);
// The row is searchable BY phone but never displays it — it shows the balance
// and a "—" where the code will be once they create an account.
// (:text-is() is a Playwright selector — it is NOT valid inside querySelector,
//  so poll through a locator instead of page.waitForFunction.)
const LIST = 'section:has(h2:text-is("Mes clients"))';
let listed = false;
for (let i = 0; i < 20 && !listed; i++) {
  listed = /\b40\b/.test(await s.locator(LIST).innerText().catch(() => ""));
  if (!listed) await s.waitForTimeout(500);
}
const listTxt = await s.locator(LIST).innerText();
t("the walk-in appears in the client list", listed, listTxt.replace(/\n+/g, " · ").slice(0, 70));
t("the list still never prints the phone", !listTxt.includes(LOCAL));

/* 3 · they sign up later — the points are already there */
const d = await b.newPage({ viewport: { width: 390, height: 844 } });
await d.goto(`${BASE}/${TEST_SLUG}/rejoindre`, { waitUntil: "networkidle" });
await d.fill('input[name="phone"]', LOCAL);
await d.fill('input[name="pin"]', "4271");
await d.fill('input[name="name"]', "WalkIn");
await d.click('button[type="submit"]');
await d.waitForURL(`**/${TEST_SLUG}`, { timeout: 20000 }).catch(() => {});
await d.reload({ waitUntil: "networkidle" });
const cardTxt = await d.locator("main").innerText();
// 30 credited + 10 welcome
t("the points are waiting on their new card", /\b40\b/.test(cardTxt),
  cardTxt.split("\n").slice(0, 8).join(" · "));

const { data: card } = await admin
  .from("accounts").select("code").eq("phone", NORM).maybeSingle();
t("signing up mints their account code", card?.code?.length === 4, card?.code ?? "none");

await b.close();
for (const x of ["loyalty_redemptions", "stamp_rewards", "loyalty_stamps"]) await admin.from(x).delete().eq("phone", NORM);
await admin.from("points_ledger").delete().eq("customer_phone", NORM);
await admin.from("diner_cafes").delete().eq("phone", NORM);
await admin.from("pin_attempts").delete().eq("phone", NORM);
await admin.from("accounts").delete().eq("phone", NORM);
await dropTestCafe();

const bad = ok.filter((x) => !x).length;
console.log(`\n${ok.length - bad}/${ok.length} walk-in checks passed`);
process.exit(bad ? 1 : 0);
