/**
 * The DINER (client) workflow, end-to-end in real Chrome.
 *
 *   node scripts/test-client.mjs
 *
 * Guards the things a customer actually does — and the regressions found by the
 * client bug hunt: identity collapse (one phone = one account, however typed),
 * per-shop enrollment (never a blank code / broken QR), multi-shop cards, buying
 * several rewards, and the codes hub. Exits non-zero if any check fails.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { env } from "./db.mjs";
import { ensureTestCafe, dropTestCafe, TEST_SLUG } from "./fixture.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? env.SUPER_ADMIN_EMAIL;
const OTHER = "e2e-second-shop";

// one fresh identity per run; LOCAL is what they type at signup
const LOCAL = `2${String(Date.now()).slice(-7)}`;
const NORM = `+216${LOCAL}`;
const PIN = "4271";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const { id: cafeA } = await ensureTestCafe({ ownerEmail: OWNER_EMAIL });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: ownerRow } = await admin.from("businesses").select("owner_id").eq("id", cafeA).single();

// a SECOND shop, so multi-card behaviour is real
await admin.from("businesses").delete().eq("slug", OTHER);
const { data: cafeB } = await admin
  .from("businesses")
  .insert({
    owner_id: ownerRow.owner_id, name: "Deuxième Boutique", slug: OTHER, status: "active",
    business_type: "boulangerie", plan: "trial",
    plan_expires_at: new Date(Date.now() + 9e8).toISOString(),
  })
  .select("id").single();
await admin.from("loyalty_programs").insert({
  business_id: cafeB.id, active: true, points_per_tnd: 1, welcome_points: 10, redeem_expiry_hours: 48,
});

const browser = await chromium.launch({ executablePath: CHROME });
const d = await browser.newPage({ viewport: { width: 390, height: 844 } });

/* ── 1. Join shop A with a bare local number ──────────────────────── */
await d.goto(`${BASE}/${TEST_SLUG}/rejoindre`, { waitUntil: "networkidle" });
await d.fill('input[name="phone"]', LOCAL);
await d.fill('input[name="pin"]', PIN);
await d.fill('input[name="name"]', "Client");
await d.click('button[type="submit"]');
await d.waitForURL(`**/${TEST_SLUG}`, { timeout: 15000 }).catch(() => {});
check("join → lands on the card", d.url().endsWith(`/${TEST_SLUG}`), d.url().replace(BASE, ""));

const { data: cardA } = await admin
  .from("diner_cafes").select("code").eq("business_id", cafeA).eq("phone", NORM).maybeSingle();
check("enrollment issues a 4-char shop code", cardA?.code?.length === 4, cardA?.code ?? "none");

/* ── 2. Every per-shop page renders with that real code ───────────── */
await d.goto(`${BASE}/${TEST_SLUG}/scanner`, { waitUntil: "networkidle" });
const scanTxt = await d.locator("main").innerText();
check("Ma carte shows the code (QR never gets an empty input)", scanTxt.includes(cardA.code), cardA.code);
check("Ma carte never shows the phone number", !scanTxt.includes(LOCAL) && !scanTxt.includes(NORM));

for (const [path, needle] of [["/codes", "Mes codes"], ["/historique", "Historique"], ["/profil", "Client"]]) {
  await d.goto(`${BASE}/${TEST_SLUG}${path}`, { waitUntil: "networkidle" });
  const txt = await d.locator("main").innerText().catch(() => "");
  check(`${path} renders`, d.url().includes(path) && txt.includes(needle), d.url().replace(BASE, ""));
}

/* ── 3. Same person, phone typed WITH the country code, no plus ─────
   The classic duplicate-account trap: this must sign them back IN, not create a
   second identity that orphans their points. */
{
  const back = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await back.goto(`${BASE}/${TEST_SLUG}/rejoindre`, { waitUntil: "networkidle" });
  await back.locator('button:has-text("déjà une carte")').click();
  await back.fill('input[name="phone"]', `216${LOCAL}`); // country code, no '+'
  await back.fill('input[name="pin"]', PIN);
  await back.locator('form button[type="submit"]').click();
  await back.waitForURL(`**/${TEST_SLUG}`, { timeout: 15000 }).catch(() => {});
  check("login with '216…' (no +) signs in, not signs up", back.url().endsWith(`/${TEST_SLUG}`), back.url().replace(BASE, ""));

  const { count } = await admin
    .from("accounts").select("phone", { count: "exact", head: true })
    .like("phone", `%${LOCAL}`);
  check("no duplicate identity was created", count === 1, `accounts matching=${count}`);
  await back.close();
}

/* ── 3b. A TYPO on the login tab must refuse — never silently sign up ──
   The diner said "I already have a card". A phone we don't know is a mistyped
   digit, and creating a fresh empty account there orphans the card they were
   trying to reach (and squats a stranger's number with a PIN they don't know). */
{
  const typo = `${LOCAL.slice(0, -1)}${(Number(LOCAL.slice(-1)) + 1) % 10}`;
  const t = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await t.goto(`${BASE}/${TEST_SLUG}/rejoindre`, { waitUntil: "networkidle" });
  await t.locator('button:has-text("déjà une carte")').click();
  await t.fill('input[name="phone"]', typo);
  await t.fill('input[name="pin"]', PIN);
  await t.locator('form button[type="submit"]').click();
  // read the FORM's own alert (the dev overlay also carries role="alert")
  const refused = await t
    .waitForFunction(
      () => /incorrect|Trop d'essais/i.test(document.querySelector("form")?.innerText ?? ""),
      undefined,
      { timeout: 15000 },
    )
    .then(() => t.locator("form").innerText())
    .catch(() => "");
  check(
    "a mistyped number on the login tab is refused",
    /incorrect|Trop d'essais/i.test(refused),
    refused.split("\n").find((l) => /incorrect|Trop/i.test(l)) ?? "no error shown",
  );

  const { count: ghosts } = await admin
    .from("accounts").select("phone", { count: "exact", head: true })
    .eq("phone", `+216${typo}`);
  check("the typo created no ghost account", (ghosts ?? 0) === 0, `accounts=${ghosts}`);

  // the phone field must survive a failed attempt (React 19 auto-resets forms)
  check("a failed attempt keeps the number typed", (await t.inputValue('input[name="phone"]')) === typo);
  await t.close();
}

/* ── 4. A second shop: scanning its QR adds a card, with its own code ── */
await d.goto(`${BASE}/${OTHER}`, { waitUntil: "networkidle" });
check("opening a new shop enrolls and renders its card", d.url().endsWith(`/${OTHER}`), d.url().replace(BASE, ""));
const { data: cardB } = await admin
  .from("diner_cafes").select("code").eq("business_id", cafeB.id).eq("phone", NORM).maybeSingle();
check("the second shop issues its OWN code", !!cardB?.code && cardB.code !== cardA.code, `${cardA.code} vs ${cardB?.code}`);

await d.goto(`${BASE}/cartes`, { waitUntil: "networkidle" });
const walletTxt = await d.locator("body").innerText();
check("wallet lists both shops", /Deuxième Boutique/.test(walletTxt) && /Café Test|Café Étoile/.test(walletTxt));

/* ── 5. Buying: points debit, a code is issued, the reward STAYS ───── */
await admin.from("points_ledger").insert({ business_id: cafeA, customer_phone: NORM, delta: 200, reason: "adjust" });
await d.goto(`${BASE}/${TEST_SLUG}/boutique`, { waitUntil: "networkidle" });

/*
  Buying is ONE explicit click with the cost in the label — no window.confirm():
  browsers suppress repeated native dialogs and a suppressed confirm() returns
  false, which silently killed the repeat-buy flow.
*/
const buyOnce = () => d.locator('button:has-text("Échanger")').first().click();

await buyOnce();
await d.waitForFunction(() => /\b[A-Z2-9]{6}\b/.test(document.querySelector("main")?.innerText ?? ""), undefined, { timeout: 20000 }).catch(() => {});
const buy1 = await d.locator("main").innerText();
const code1 = buy1.match(/\b[A-Z2-9]{6}\b/)?.[0] ?? "";
check("buying issues a counter code", !!code1, code1 || "none");
check("the reward stays buyable after a purchase", /Échanger/.test(buy1));

// buy a second time — a diner with points may stack codes
await buyOnce();
await d.waitForTimeout(3000);
const { count: redemptions } = await admin
  .from("loyalty_redemptions").select("id", { count: "exact", head: true })
  .eq("business_id", cafeA).eq("phone", NORM);
check("a second purchase is possible (codes stack)", (redemptions ?? 0) >= 2, `redemptions=${redemptions}`);

/* ── 6. The codes hub lists what's waiting ─────────────────────────── */
await d.goto(`${BASE}/${TEST_SLUG}/codes`, { waitUntil: "networkidle" });
const codesTxt = await d.locator("main").innerText();
check("Mes codes lists the pending code(s)", codesTxt.includes(code1), code1);

/* ── 7. Signing out clears the card ────────────────────────────────── */
await d.goto(`${BASE}/${TEST_SLUG}/profil`, { waitUntil: "networkidle" });
await d.locator('button:has-text("Changer de compte")').click();
await d.waitForTimeout(2500);
await d.goto(`${BASE}/${TEST_SLUG}`, { waitUntil: "networkidle" });
check("after logout the card asks to join again", d.url().includes("/rejoindre"), d.url().replace(BASE, ""));

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
await admin.from("businesses").delete().eq("id", cafeB.id);
await dropTestCafe();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} client checks passed`);
process.exit(failed.length ? 1 : 0);
