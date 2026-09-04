/** Walk-in: credit a phone with NO account, then sign up and find the points. */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { env } from "./db.mjs";
import { ensureTestCafe, dropTestCafe, TEST_SLUG, OWNER_EMAIL } from "./fixture.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const LOCAL = `2${String(Date.now()).slice(-7)}`;
const NORM = `+216${LOCAL}`;

const ok = [];
const t = (n, p, d = "") => { ok.push(p); console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); };

/* Named the founder's account outright, so this suite signed in as a
   super-admin and dropped their shop on the way out. See fixture.mjs. */
const { ownerPassword: OWNER_PASSWORD } = await ensureTestCafe();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

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

const s = await newFrenchPage(b, { viewport: { width: 390, height: 844 } });
await s.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
await s.fill('input[name="email"]', OWNER_EMAIL);
await s.fill('input[name="password"]', OWNER_PASSWORD);
await s.click('button[type="submit"]');
await s.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});

/*
  1 · credit a phone that has NEVER signed up

  THE TILL IS A MENU OF TWO ACTS: pick the money, then say who it is for. The
  walk-in path is the second step accepting a phone number instead of a card
  code — a person with no account at all, whose points wait for them.
*/
const DESK = '[role="dialog"]';
const till = async () => {
  /*
    Dismiss a receipt still on screen.

    It waits for a tap now instead of removing itself after four seconds — that
    is the point of it — so a suite that served somebody and then walked on
    would find every later click swallowed by the overlay. Tapping OK is what a
    cashier does, and it is what makes the reads between serve() and here safe:
    the receipt is still there while its values are read, and gone before
    anything else is pressed.
  */
  const ok = s.locator('[data-receipt] button:has-text("OK")');
  if (await ok.count()) await ok.click().catch(() => {});
  await s.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
  await s.locator('button:has-text("Donner")').waitFor({ timeout: 20000 });
};
const serve = async (who, amount) => {
  await till();
  /* /owner IS the counter now — there is no home screen to open, so the
     amount, the stamps, the camera and the field are already on screen. */
  if (amount !== null) {
    await s.locator('input[name="amount"]').waitFor({ timeout: 15000 });
    await s.fill('input[name="amount"]', String(amount));
  } else {
    /* Stamp-only: the stepper replaced the "+1 tampon" button, and it can go
       past one — which is why a cashier no longer scans the same card twice. */
    await s.locator('button[aria-label="Un tampon de plus"]').click();
  }
  await s.fill('input[name="customer"]', who);
  await s.locator('.a-card:has(input[name="customer"]) button').click();
  await s.locator('button:has-text("Oui")').first().click({ timeout: 20000 });
  const receipt = s.locator("[data-receipt]");
  await receipt.waitFor({ timeout: 20000 }).catch(() => {});
  return receipt;
};
const openFiche = async (who) => {
  /*
    The lookup is not a button on the till any more — the till is two acts, and
    this is the third thing (see components/OwnerMenu). It lives in the floating
    menu and travels as an address, so that is what this opens. Clicking through
    the sheet instead would tie every one of these helpers to the menu's markup;
    the ADDRESS is the contract the menu itself uses, and test-owner exercises
    the sheet once so the item cannot silently stop linking here.
  */
  await s.goto(`${BASE}/owner?client=1`, { waitUntil: "networkidle" });
  await s.locator('input[name="customer"]').waitFor({ timeout: 15000 });
  await s.fill('input[name="customer"]', who);
  await s.locator('button:has-text("Chercher")').click();
  return s.locator(DESK).waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
};

const walkIn = await serve(LOCAL, 30);
const credTxt = (await walkIn.count()) ? await walkIn.innerText() : "";
t("the till serves somebody with no account at all", (await walkIn.count()) === 1);
t("credit works before signup", /\+30/.test(credTxt), credTxt.split("\n").find((l) => /\+30/.test(l)) ?? "");
/*
  THE RECEIPT SAYS WHICH KIND OF STRANGER THIS IS, and the distinction is the
  whole feature: "no card here" and "no Pointili account" are different facts,
  and a cashier who reads the first as the second turns a paying customer away.
*/
t("the receipt says they are not signed up yet", /pas encore inscrit/i.test(credTxt),
  credTxt.split("\n").find((l) => /inscrit|visite/i.test(l)) ?? credTxt.replace(/\n+/g, " · ").slice(0, 80));
t("the receipt never prints the phone", !credTxt.includes(LOCAL) && !credTxt.includes(NORM));

const { data: acc } = await admin.from("accounts").select("phone, code").eq("phone", NORM).maybeSingle();
t("no ghost account was invented", !acc);
// No account ⇒ no code. That is now the load-bearing invariant: a mistyped digit
// must never mint a platform identity.
t("a walk-in is reachable by no code at all", !acc?.code);

/* 2 · the walk-in is still reachable, and still never printed
   The browsable "Mes clients" list is gone from the till, so this puts the same
   two questions to the surface that survived it: type the phone, and the
   terminal opens them holding their points — with a masked number, never the
   digits. */
await openFiche(LOCAL);
let listed = false;
for (let i = 0; i < 20 && !listed; i++) {
  listed = /\b40\b/.test(await s.locator(DESK).innerText().catch(() => ""));
  if (!listed) await s.waitForTimeout(500);
}
const listTxt = await s.locator(DESK).innerText();
t("the walk-in is reachable by phone at the till", listed, listTxt.replace(/\n+/g, " · ").slice(0, 70));
t("the till still never prints the phone", !listTxt.includes(LOCAL));

/* 3 · they sign up later — the points are already there */
const d = await newFrenchPage(b, { viewport: { width: 390, height: 844 } });
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
