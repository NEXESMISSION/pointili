/**
 * End-to-end check of the whole loop, driven through the real UI in real Chrome.
 *
 *   node scripts/e2e.mjs
 *
 * Consume → Earn → Play → Redeem, plus the rules that matter:
 * welcome-once, cooldown, claim-once. Exits non-zero if any check fails.
 */
import { createClient } from "@supabase/supabase-js";
import { env, onExit } from "./db.mjs";
import { ensureTestCafe, dropTestCafe, TEST_SLUG } from "./fixture.mjs";
import { chromium } from "playwright-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const SLUG = TEST_SLUG;

// a fresh phone per run so signup is always exercised
const PHONE = `2${String(Date.now()).slice(-7)}`;
const PIN = "4271";

// The owner app is behind real Supabase Auth once keys are configured.
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? env.SUPER_ADMIN_EMAIL;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? env.SUPER_ADMIN_PASSWORD;

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// Provision a fresh throwaway café owned by the caisse login, so this run is
// self-contained and leaves no fixture data behind.
await ensureTestCafe({ ownerEmail: OWNER_EMAIL });

const browser = await chromium.launch({ executablePath: CHROME });
const diner = await browser.newPage({ viewport: { width: 390, height: 844 } });

// ── 1. Onboarding: phone + PIN → welcome bonus ──────────────────────
await diner.goto(`${BASE}/${SLUG}/rejoindre`, { waitUntil: "networkidle" });
await diner.fill('input[name="phone"]', PHONE);
await diner.fill('input[name="pin"]', PIN);
await diner.fill('input[name="name"]', "E2E");
await diner.click('button[type="submit"]');
await diner.waitForURL(`**/${SLUG}`, { timeout: 15000 });

const balAfterJoin = await diner
  .locator("section")
  .first()
  .innerText()
  .then((t) => Number(t.match(/\n(\d+)\n/)?.[1] ?? t.match(/(\d+)/)?.[1]));
check("signup grants welcome bonus", balAfterJoin === 10, `balance=${balAfterJoin}`);

// ── 2. Owner signs in (real Supabase Auth) ──────────────────────────
const staff = await browser.newPage({ viewport: { width: 390, height: 844 } });
await staff.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
if (staff.url().includes("/login")) {
  await staff.fill('input[name="email"]', OWNER_EMAIL);
  await staff.fill('input[name="password"]', OWNER_PASSWORD);
  await staff.click('button[type="submit"]');
  await staff.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});
}
check("owner signs in with Supabase Auth", !staff.url().includes("/login"), staff.url().replace(BASE, ""));

// ── 3. Caisse: credit a purchase ────────────────────────────────────
/**
 * Credit, then wait for the result that matches the expected balance.
 *
 * Deliberately NOT a fixed sleep: the caisse now round-trips to Postgres in
 * Zurich, so any timeout long enough today is a flake tomorrow. Polling for the
 * expected balance also stops a stale result from the previous credit being
 * misread as this one's.
 */

/*
 * The caisse is a terminal: the keypad is the resting state (the camera only
 * opens when asked), and the identified customer takes over the whole screen as
 * a dialog.
 */
const DESK = '[role="dialog"]';

async function openCustomer(page, who) {
  await page.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
  await page.locator('input[name="customer"]').waitFor({ timeout: 15000 });
  await page.fill('input[name="customer"]', who);
  await page.locator('button:has-text("Chercher")').click();
  await page.locator(DESK).waitFor({ timeout: 20000 });
}

/** Switch the terminal to its "a code" mode. */
async function openCodeMode(page) {
  await page.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
  await page.locator('button:has-text("Valider une récompense")').click();
  await page.locator('input[name="code"]').waitFor({ timeout: 15000 });
}

/** Réglages is a settings list — each knob lives one tap deep in its own editor. */
async function openSetting(page, row) {
  await page.goto(`${BASE}/owner/reglages`, { waitUntil: "networkidle" });
  await page.locator(`button:has-text("${row}")`).click();
}
async function openPointsEditor(page) {
  await openSetting(page, "Les points");
  await page.locator('form:has(input[name="pointsPerTnd"]) input[name="pointsPerTnd"]').waitFor({ timeout: 15000 });
}

async function credit(amount, expectBalance) {
  await openCustomer(staff, PHONE);
  await staff.fill('input[name="amount"]', String(amount));
  await staff.locator('button:has-text("Créditer")').click();
  await staff
    .waitForFunction(
      (want) => document.querySelector('[role="status"]')?.textContent?.includes(want),
      `${expectBalance} points`,
      { timeout: 20000 },
    )
    .catch(() => {});
  return staff.locator('[role="status"]').innerText();
}

/* 12,5 dinars earns 12,5 points — not 12. floor() used to delete the half
   dinar on every single sale (migration 0027), and this is the check that
   would have caught it: it asserted the bug instead. */
const creditTxt = await credit(12.5, 22.5);
check("caisse credits 12,5 × 1 = 12,5 — no fraction lost", /\+12,5/.test(creditTxt), creditTxt.split("\n")[0]);
check("balance = 10 welcome + 12,5 earned = 22,5", /22,5 points/.test(creditTxt));

/*
  The ledger has to remember the DINARS, not just the points it derived from
  them. Without this the amount the cashier keyed vanished at commit, so a
  correction could never explain itself and Analyses had to rebuild revenue by
  dividing by the CURRENT rate — silently rewriting last month every time an
  owner edited that setting. 12.5 also proves the decimal survives.
*/
{
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: biz } = await admin.from("businesses").select("id").eq("slug", SLUG).maybeSingle();
  const { data: rows } = await admin
    .from("points_ledger")
    .select("delta, reason, amount_tnd")
    .eq("business_id", biz?.id ?? "")
    .eq("customer_phone", `+216${PHONE}`)
    .eq("reason", "earn")
    .order("id", { ascending: true });
  const first = rows?.[0];
  check(
    "the ledger records the dinars, not only the points",
    Number(first?.amount_tnd) === 12.5,
    `delta=${first?.delta} amount_tnd=${first?.amount_tnd}`,
  );
  const welcome = await admin
    .from("points_ledger")
    .select("amount_tnd")
    .eq("business_id", biz?.id ?? "")
    .eq("customer_phone", `+216${PHONE}`)
    .eq("reason", "welcome")
    .maybeSingle();
  check(
    "a welcome bonus records no amount — nobody paid for it",
    welcome.data?.amount_tnd === null,
    String(welcome.data?.amount_tnd),
  );
}

// ── 4. Welcome must not be granted twice ────────────────────────────
const credit2 = await credit(5, 27.5);
check(
  "welcome bonus granted once only",
  !/bienvenue/i.test(credit2) && /27,5 points/.test(credit2),
  credit2.replace(/\n/g, " · "),
);

// Points are the ONLY way to earn in the MVP — there is no wheel. The /api/play
// endpoint is removed; the auth section below proves it's gone, not just hidden.

// ── 5. Boutique: points buy a reward, which issues a counter code ────
// Cheapest reward is 40 pts; balance is 27,5, so top up first (→ 67,5).
await credit(40, 67.5);

await diner.goto(`${BASE}/${SLUG}/boutique`, { waitUntil: "networkidle" });
diner.once("dialog", (d) => d.accept()); // confirm step
const redeemBtn = diner.locator('button:has-text("Échanger")').first();
let redeemCode = "";
if (await redeemBtn.count()) {
  await redeemBtn.click();
  // Poll for the issued code rather than sleeping — same Zurich round-trip.
  const gotCode = await diner
    .waitForFunction(
      () => /\b[A-Z2-9]{6}\b/.test(document.querySelector("main")?.innerText ?? ""),
      undefined,
      { timeout: 20000 },
    )
    .then(() => true)
    .catch(() => false);
  const boutiqueTxt = await diner.locator("main").innerText();
  redeemCode = boutiqueTxt.match(/\b[A-Z2-9]{6}\b/)?.[0] ?? "";
  check("redeem debits points and issues a code", gotCode && !!redeemCode, redeemCode || "no code");

  await diner.goto(`${BASE}/${SLUG}`, { waitUntil: "networkidle" });
  const cardTxt = await diner.locator("main").innerText();
  // "Récompenses à récupérer", not "À montrer au comptoir": that older wording now
  // collides with the account-code CTA higher up the same page.
  check(
    "redeemed reward appears on Accueil (Récompenses à récupérer)",
    /RÉCOMPENSES À RÉCUPÉRER/i.test(cardTxt) && cardTxt.includes(redeemCode),
    redeemCode,
  );
} else {
  check("redeem button present when affordable", false, "no Échanger button");
}

// ── 6. That code is collectable exactly once, via the two-step counter ─
if (redeemCode) {
  /*
    Two-step counter flow: enter the code → "Vérifier" (read-only look-up) →
    "Collecter" only if the operator confirms. A peek must NOT serve the code, so
    the loop clicks Collecter explicitly; a second visit finds it already claimed.
  */
  const SEC = 'section:has(h2:has-text("Valider une récompense"))';
  const claim = async () => {
    await openCodeMode(staff);
    await staff.fill(`${SEC} input[name="code"]`, redeemCode);
    await staff.locator(`${SEC} button:has-text("Vérifier")`).click();
    const collect = staff.locator(`${SEC} button:has-text("Collecter")`);
    await collect.waitFor({ timeout: 8000 }).catch(() => {});
    if (await collect.count()) {
      await collect.click();
      await staff.locator(`${SEC} [role="status"]`).waitFor({ timeout: 20000 }).catch(() => {});
    }
    return staff.locator(SEC).innerText().catch(() => "");
  };

  // A peek alone must not serve it: look up, then leave without collecting.
  await openCodeMode(staff);
  await staff.fill(`${SEC} input[name="code"]`, redeemCode);
  await staff.locator(`${SEC} button:has-text("Vérifier")`).click();
  await staff.locator(`${SEC} button:has-text("Collecter")`).waitFor({ timeout: 8000 }).catch(() => {});
  const peeked = await staff.locator(SEC).innerText().catch(() => "");
  check(
    "peek shows the code without serving it",
    /Collecter/i.test(peeked) && !/collecté/i.test(peeked),
    peeked.replace(/\n/g, " · "),
  );

  const first = await claim();
  check("code collects once", /collecté/i.test(first), first.replace(/\n/g, " · "));
  const second = await claim();
  check("same code cannot be reused", /déjà.*utilisé/i.test(second), second.replace(/\n/g, " · "));

  // and the collected reward shows up in the diner's own history (Historique)
  await diner.goto(`${BASE}/${SLUG}/historique`, { waitUntil: "networkidle" });
  const histTxt = await diner.locator("main").innerText();
  check("collected item appears in diner history", /Récupéré/i.test(histTxt),
    histTxt.split("\n").find((l) => /Récupéré/i.test(l)) ?? "");
}

// ── 11. Réglages actually save, and the caisse obeys them ───────────
//
// Regression guard. The panel once showed "Enregistré ✦" while writing nothing:
// `drop schema public cascade` had wiped `authenticated`'s table GRANTs, and a
// zero-row UPDATE is not an error in Postgres. A settings page that lies is
// worse than one that's read-only.
{
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: biz } = await admin.from("businesses").select("id").eq("slug", SLUG).single();

  // Réglages is a settings list — the points knob lives one tap deep.
  await openPointsEditor(staff);
  const earn = staff.locator('form:has(input[name="pointsPerTnd"])');
  await earn.locator('input[name="pointsPerTnd"]').fill("3");
  await earn.locator('input[name="welcomePoints"]').fill("25");
  await earn.locator('button[type="submit"]').click();
  await earn.locator('[role="status"], [role="alert"]').first().waitFor({ timeout: 20000 }).catch(() => {});

  const { data: prog } = await admin
    .from("loyalty_programs")
    .select("points_per_tnd, welcome_points")
    .eq("business_id", biz.id)
    .single();
  check(
    "réglages persist to the database",
    Number(prog.points_per_tnd) === 3 && prog.welcome_points === 25,
    `${prog.points_per_tnd} pt/TND · ${prog.welcome_points} welcome`,
  );

  /*
    …and the change must actually reach the caisse.

    The till now works on CARDHOLDERS, not bare phone numbers: a customer has to
    have joined (which is what gives them a per-shop code) before they can be
    credited. That is deliberate — crediting an arbitrary typed number used to
    mint points on a phone with no card, which the Clients list could never show
    and nobody could ever correct. So enrol a fresh diner first, exactly as
    scanning the QR would.
  */
  const newPhone = `2${String(Date.now()).slice(-7)}`;
  const newNorm = `+216${newPhone}`;
  // Through the RPC: it mints the account code with a retry, which a raw insert
  // (falling back to the column DEFAULT) cannot do.
  await admin.rpc("create_account", { p_phone: newNorm, p_pin_hash: "x", p_name: "Rate" });
  await admin.rpc("enroll_diner", { p_business_id: biz.id, p_phone: newNorm });
  await openCustomer(staff, newPhone);
  await staff.fill('input[name="amount"]', "10");
  await staff.locator('button:has-text("Créditer")').click();
  await staff.waitForSelector('[role="status"]', { timeout: 20000 }).catch(() => {});
  const rateTxt = await staff.locator('[role="status"]').innerText();
  check(
    "caisse uses the owner's new rate (10 TND x 3 = 30)",
    /\+30/.test(rateTxt) && /25 de bienvenue/i.test(rateTxt),
    rateTxt.replace(/\n+/g, " · "),
  );

  // nonsense must be refused, not stored
  await openPointsEditor(staff);
  const earnForm = 'form:has(input[name="pointsPerTnd"])';
  await staff.locator(`${earnForm} input[name="pointsPerTnd"]`).fill("-5");
  await staff.locator(`${earnForm} button[type="submit"]`).click();
  // Wait for the verdict, don't sleep and hope: the action round-trips to
  // Zurich, so any fixed timeout is a flake waiting to happen.
  const rejected = await staff
    .waitForSelector(`${earnForm} [role="alert"]`, { timeout: 20000 })
    .then((el) => el.innerText())
    .catch(() => "");
  check("réglages reject an invalid rate", /entre 0,1 et 100/.test(rejected), rejected);

  check(
    "owner can sign out from the app",
    (await staff.locator('button:has-text("Se déconnecter")').count()) > 0,
  );

  // restore defaults + clean the throwaway diner
  await admin.from("loyalty_programs")
    .update({ points_per_tnd: 1, welcome_points: 10 })
    .eq("business_id", biz.id);
  await admin.from("points_ledger").delete().eq("customer_phone", newNorm);
  await admin.from("diner_cafes").delete().eq("phone", newNorm);
  await admin.from("accounts").delete().eq("phone", newNorm);
}

// ── 11b. The shop logo uploads, persists small, and shows on the card ─
{
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: biz } = await admin.from("businesses").select("id").eq("slug", SLUG).single();

  await openSetting(staff, "Nom, logo & type");
  // Scope to the LOGO input (reward rows have their own image inputs too).
  // The uploader downscales on a canvas and auto-saves, so wait for the verdict.
  const logoInput = 'label:has-text("logo") input[type="file"]';
  await staff.locator(logoInput).waitFor({ state: "attached", timeout: 15000 });
  await staff.setInputFiles(logoInput, "public/brand-mark.png");
  await staff.locator("text=Enregistré ✦").first().waitFor({ timeout: 20000 }).catch(() => {});

  const { data: withLogo } = await admin.from("businesses").select("logo_url").eq("id", biz.id).single();
  const uri = withLogo?.logo_url ?? "";
  check(
    "logo uploads and persists as a compact image",
    /^data:image\/(png|jpe?g|webp);base64,/.test(uri) && uri.length < 500_000,
    uri ? `${Math.round(uri.length / 1024)} KB` : "no logo_url",
  );

  // it must actually reach the (signed-in) diner's card header
  await diner.goto(`${BASE}/${SLUG}`, { waitUntil: "networkidle" });
  check("logo appears on the client card header", (await diner.locator("header img").count()) > 0);

  await admin.from("businesses").update({ logo_url: null }).eq("id", biz.id);
}

// ── 11c. A returning cardholder signs back in (new device / no cookie) ─
{
  // browser.newPage() gets a fresh context — no diner cookie, like a new phone.
  const back = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await back.goto(`${BASE}/${SLUG}/rejoindre`, { waitUntil: "networkidle" });
  await back.locator('button:has-text("déjà un compte")').click();
  await back.fill('input[name="phone"]', PHONE);
  await back.fill('input[name="pin"]', PIN);
  await back.locator('form button[type="submit"]').click();
  await back.waitForURL(`**/${SLUG}`, { timeout: 15000 }).catch(() => {});
  const landed = await back
    .waitForFunction(
      () => /Tes points/i.test(document.querySelector("main")?.innerText ?? ""),
      undefined,
      { timeout: 10000 },
    )
    .then(() => true)
    .catch(() => false);
  check(
    "returning diner signs in with phone + PIN",
    back.url().endsWith(`/${SLUG}`) && landed,
    back.url().replace(BASE, ""),
  );

  // and it's the SAME account — not a duplicate, no second welcome bonus
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { count } = await admin
    .from("accounts")
    .select("phone", { count: "exact", head: true })
    .eq("phone", `+216${PHONE}`);
  check("no duplicate account is created on sign-in", count === 1, `accounts=${count}`);
  await back.close();
}

// ── 11d. Stamp cards: +1 at the caisse fills a card and issues a code ──
{
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: biz } = await admin.from("businesses").select("id").eq("slug", SLUG).single();
  // small card so the test fills it fast
  await admin
    .from("loyalty_programs")
    .update({ stamps_enabled: true, stamps_required: 2, stamp_reward: "Café offert (tampons)" })
    .eq("business_id", biz.id);

  const stamp = async () => {
    await openCustomer(staff, PHONE);
    await staff.locator('button:has-text("+1 tampon")').click();
    await staff.locator('[role="status"]').waitFor({ timeout: 20000 }).catch(() => {});
    return staff.locator(DESK).innerText().catch(() => "");
  };

  await stamp(); // 1/2
  const full = await stamp(); // 2/2 → completes, issues a code
  const stampCode = full.match(/code\s+([A-Z2-9]{6})/)?.[1] ?? "";
  check("a full stamp card completes and issues a code", /Carte pleine/i.test(full) && !!stampCode, stampCode || full.replace(/\n/g, " · ").slice(0, 60));

  // the diner can collect that code at the counter, exactly like any reward
  if (stampCode) {
    const SEC = 'section:has(h2:has-text("Valider une récompense"))';
    await openCodeMode(staff);
    await staff.fill(`${SEC} input[name="code"]`, stampCode);
    await staff.locator(`${SEC} button:has-text("Vérifier")`).click();
    const collect = staff.locator(`${SEC} button:has-text("Collecter")`);
    await collect.waitFor({ timeout: 8000 }).catch(() => {});
    if (await collect.count()) await collect.click();
    await staff.locator(`${SEC} [role="status"]`).waitFor({ timeout: 20000 }).catch(() => {});
    const collected = await staff.locator(SEC).innerText().catch(() => "");
    check("stamp reward collects at the counter", /collecté/i.test(collected), collected.replace(/\n/g, " · ").slice(0, 60));
  }

  // it shows on the diner's Historique
  await diner.goto(`${BASE}/${SLUG}/historique`, { waitUntil: "networkidle" });
  const hist = await diner.locator("main").innerText();
  check("collected stamp reward appears in diner history", /Café offert \(tampons\)/i.test(hist));

  // the owner can still reach this cardholder by typing the number — the panel
  // shows the name + opaque id, never the raw phone. (The browsable "Mes
  // clients" list was removed from the caisse; this is the surface that stayed.)
  await openCustomer(staff, PHONE);
  const found = await staff
    .waitForFunction(() => /E2E/.test(document.querySelector("main")?.innerText ?? ""), undefined, { timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check("the till finds a cardholder by number", found);
  const clientsTxt = await staff.locator("main").innerText();
  check("the till never exposes the raw phone number", !clientsTxt.includes(`+216${PHONE}`), "phone hidden");

  // ── 11e. Privacy: credit by the 4-char account code, no phone typed ──
  const { data: card } = await admin
    .from("accounts")
    .select("code")
    .eq("phone", `+216${PHONE}`)
    .single();
  check("customer has a 4-char account code", typeof card?.code === "string" && card.code.length === 4, card?.code ?? "none");
  await openCustomer(staff, card.code);
  await staff.fill('input[name="amount"]', "5");
  await staff.locator('button:has-text("Créditer")').click();
  await staff.locator('[role="status"]').waitFor({ timeout: 20000 }).catch(() => {});
  const credTxt = await staff.locator(DESK).innerText();
  check("crediting by the short code works", /\+5/.test(credTxt), credTxt.split("\n").find((l) => /\+5/.test(l)) ?? "");
  check("credit result shows a name, not the phone", !credTxt.includes(`+216${PHONE}`));

  await admin.from("loyalty_programs").update({ stamps_enabled: false }).eq("business_id", biz.id);
}

// ── 12. A brand-new owner can onboard (and must not get stuck) ──────
//
// Regression guard. This used to be an infinite loop: /owner had no café so it
// redirected to /owner/login, which saw a valid session and redirected back to
// /owner — forever, with no reachable logout. Every new signup was locked out.
{
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const email = `e2e-owner-${Date.now()}@example.com`;
  const { data: created } = await admin.auth.admin.createUser({
    email,
    password: "Test-12345678",
    email_confirm: true,
  });
  // deleted here AND on failure — a suite that throws used to leave a live account
  onExit(() => admin.auth.admin.deleteUser(created.user.id));

  const fresh = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const hops = [];
  fresh.on("framenavigated", (f) => {
    if (f === fresh.mainFrame()) hops.push(new URL(f.url()).pathname);
  });

  await fresh.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
  await fresh.fill('input[name="email"]', email);
  await fresh.fill('input[name="password"]', "Test-12345678");
  await fresh.click('button[type="submit"]');
  await fresh.waitForURL("**/nouveau", { timeout: 20000 }).catch(() => {});

  check(
    "new owner with no café is not stuck in a redirect loop",
    hops.filter((h) => h === "/owner").length <= 1 && fresh.url().includes("/nouveau"),
    hops.join(" → "),
  );

  await fresh.fill('input[name="name"]', "Café de l'Étoile & Co");
  await fresh.locator('form:has(input[name="name"]) button[type="submit"]').click();
  await fresh.waitForURL((u) => u.pathname === "/owner", { timeout: 25000 }).catch(() => {});

  const { data: biz } = await admin
    .from("businesses")
    .select("id, slug")
    .eq("owner_id", created.user.id)
    .maybeSingle();

  check(
    "café is created and the owner lands on Analyses",
    new URL(fresh.url()).pathname === "/owner" && !!biz,
    biz ? `/${biz.slug}` : "no café row",
  );

  // accents and punctuation must produce a clean, routable slug
  check("slug is clean and the diner page is live", biz?.slug === "cafe-de-letoile-co", biz?.slug ?? "—");
  if (biz) {
    const r = await fetch(`${BASE}/${biz.slug}`);
    check(`diner page /${biz.slug} responds`, r.status === 200, `status=${r.status}`);
  }

  await fresh.close();
  if (biz) await admin.from("businesses").delete().eq("id", biz.id);
  /* Registered as well as called: a suite that throws before this line used to
   leave a live, sign-in-able account in the production database. */
await admin.auth.admin.deleteUser(created.user.id);
}

// ── 13. The wheel is gone, not just hidden — the endpoint must not exist ─
// A points-only MVP has no /api/play; poking it should 404/405, never spin.
const anon = await browser.newPage();
await anon.goto(BASE, { waitUntil: "domcontentloaded" });
const playStatus = await anon.evaluate(async (slug) => {
  const r = await fetch("/api/play", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug, phone: "+21620123456" }),
  });
  return r.status;
}, SLUG);
check("wheel endpoint /api/play is removed", playStatus === 404 || playStatus === 405, `status=${playStatus}`);

/* ── 14. ONE ORIGIN, TWO SESSIONS ────────────────────────────────────
   The host split is gone, so the diner cookie and the owner session now
   arrive on the same origin. They used to be isolated by accident — two
   hosts, host-only cookies — and this is the test that replaces that
   accident with something checked.

   Every other page in this suite comes from browser.newPage(), which gets
   its own context and therefore its own empty cookie jar. That is the one
   thing that must NOT happen here: this block uses a single context and
   deliberately puts BOTH cookies in it, which is a real shared family
   phone. The failure it guards is documented and specific — a shop owner
   thrown into a family member's wallet, unable to get back because the
   sign-in link lives on the page the bounce prevents. */
{
  const shared = await browser.newContext();
  const page = await shared.newPage();
  const hasDiner = async () =>
    (await shared.cookies()).some((c) => c.name === "pointili_diner");

  /* Become a diner the way a diner does — /moi with the phone and PIN minted
     back in step 1. Merely visiting a shop page sets no cookie. */
  await page.goto(`${BASE}/moi`, { waitUntil: "networkidle" });
  await page.fill('input[name="phone"]', PHONE);
  await page.fill('input[name="pin"]', PIN);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/cartes**", { timeout: 20000 }).catch(() => {});
  check("shared phone holds a diner session", await hasDiner(), page.url());

  // the owner doors must be reachable ANYWAY — they are what the split used
  // to guarantee by living on another host
  for (const p of ["/owner/login", "/owner/signup"]) {
    await page.goto(BASE + p, { waitUntil: "networkidle" });
    check(`a diner cookie does not block ${p}`, new URL(page.url()).pathname === p, new URL(page.url()).pathname);
  }

  // and signing in must work from that same jar
  await page.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', OWNER_EMAIL);
  await page.fill('input[name="password"]', OWNER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});
  check(
    "an owner signs in on a phone that already holds a diner cookie",
    !new URL(page.url()).pathname.startsWith("/cartes") && !new URL(page.url()).pathname.includes("/login"),
    new URL(page.url()).pathname,
  );

  /*
    "/" is the manifest's start_url, so this is also what the installed app opens
    on. An owner session must win over the diner cookie AND be sent somewhere
    useful.

    This check used to assert pathname === "/" — the owner cookie only stopped
    the diner bounce and then fell through to the marketing page. That passed,
    and it was wrong: an owner who installed the app opened it every morning onto
    a page selling them the product they already pay for. Landing on the till is
    the contract; not landing in someone else's wallet is the half of it that was
    ever tested.
  */
  await page.goto(BASE, { waitUntil: "networkidle" });
  check(
    "an owner opens the app on their till, not the wallet or the sales page",
    new URL(page.url()).pathname === "/owner",
    new URL(page.url()).pathname,
  );

  // …and can still reach their own marketing page deliberately
  await page.goto(`${BASE}/?pro=1`, { waitUntil: "networkidle" });
  check(
    "?pro=1 still shows an owner the sales page",
    new URL(page.url()).pathname === "/",
    new URL(page.url()).pathname,
  );

  // signing out lands on the sign-in screen, never on "/" where the diner
  // cookie would take over the moment the session is gone
  await page.goto(`${BASE}/owner/reglages`, { waitUntil: "networkidle" });
  const logout = page.locator('form button:has-text("Se déconnecter")').first();
  await logout.waitFor({ timeout: 15000 });
  await logout.click();
  await page.waitForURL((u) => !u.pathname.startsWith("/owner/reglages"), { timeout: 20000 }).catch(() => {});
  check(
    "signing out lands on /owner/login, not the wallet",
    new URL(page.url()).pathname === "/owner/login",
    new URL(page.url()).pathname,
  );

  // the diner is still a diner — isolation, not eviction
  check("the diner session survived all of it", await hasDiner());

  await shared.close();
}

await browser.close();

/* ── Clean up after ourselves ────────────────────────────────────────
   This runs against the REAL database. Every pass used to leave a fake diner
   behind, and those robots then showed up as customers in the owner's Analyses —
   inflating retention with test traffic. A test that corrupts the numbers it is
   meant to protect is worse than no test.                                     */
{
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  // normalisePhone() prefixes the country code onto the WHOLE local number —
  // `.slice(1)` here silently targeted a phone that never existed, so the
  // cleanup deleted nothing and the robots piled up.
  const phone = `+216${PHONE}`;
  // order matters: children before the account they reference
  await admin.from("loyalty_redemptions").delete().eq("phone", phone);
  await admin.from("stamp_rewards").delete().eq("phone", phone);
  await admin.from("loyalty_stamps").delete().eq("phone", phone);
  await admin.from("wins").delete().eq("phone", phone);
  await admin.from("plays").delete().eq("phone", phone);
  await admin.from("points_ledger").delete().eq("customer_phone", phone);
  await admin.from("diner_cafes").delete().eq("phone", phone);
  await admin.from("diner_streaks").delete().eq("phone", phone);
  await admin.from("pin_attempts").delete().eq("phone", phone);
  await admin.from("accounts").delete().eq("phone", phone);
  console.log(`\ncleaned up test diner ${phone}`);
}

// tear down the throwaway café (and everything under it)
await dropTestCafe();
console.log(`cleaned up test café /${SLUG}`);

const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
