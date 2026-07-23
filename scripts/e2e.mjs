/**
 * End-to-end check of the whole loop, driven through the real UI in real Chrome.
 *
 *   node scripts/e2e.mjs
 *
 * Consume → Earn → Play → Redeem, plus the rules that matter:
 * welcome-once, cooldown, claim-once. Exits non-zero if any check fails.
 */
import { createClient } from "@supabase/supabase-js";
import { env } from "./db.mjs";
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
async function credit(amount, expectBalance) {
  await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
  await staff.fill('input[name="phone"]', PHONE);
  await staff.fill('input[name="amount"]', String(amount));
  await staff.locator('form:has(input[name="amount"]) button[type="submit"]').click();
  await staff
    .waitForFunction(
      (want) => document.querySelector('[role="status"]')?.textContent?.includes(want),
      `${expectBalance} pts`,
      { timeout: 20000 },
    )
    .catch(() => {});
  return staff.locator('[role="status"]').innerText();
}

const creditTxt = await credit(12.5, 22);
check("caisse credits floor(12.5 x 1) = 12", /\+12/.test(creditTxt), creditTxt.split("\n")[0]);
check("balance = 10 welcome + 12 earned = 22", /22 pts/.test(creditTxt));

// ── 4. Welcome must not be granted twice ────────────────────────────
const credit2 = await credit(5, 27);
check(
  "welcome bonus granted once only",
  !/bienvenue/i.test(credit2) && /27 pts/.test(credit2),
  credit2.replace(/\n/g, " · "),
);

// ── 5. The spin is server-decided, and lands where the server said ──
const play1 = await diner.evaluate(async (slug) => {
  const r = await fetch("/api/play", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug }),
  });
  return { status: r.status, body: await r.json() };
}, SLUG);
check("spin returns a prize", play1.status === 200 && !!play1.body.prizeLabel, play1.body.prizeLabel);
check("winning spin issues a code", !!play1.body.code, play1.body.code);

// ── 6. Cooldown blocks an immediate replay ──────────────────────────
const play2 = await diner.evaluate(async (slug) => {
  const r = await fetch("/api/play", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug }),
  });
  return { status: r.status, body: await r.json() };
}, SLUG);
check("cooldown blocks re-spin (429)", play2.status === 429, play2.body.error);

// ── 7. The code is claimable exactly once ───────────────────────────
const code = play1.body.code;
if (code) {
  /*
    Two-step counter flow: enter the code → "Vérifier" (read-only look-up) →
    "Collecter" only if the operator confirms. A peek must NOT serve the code, so
    the loop clicks Collecter explicitly; a second visit finds it already claimed.
  */
  const SEC = 'section:has(h2:has-text("Valider un code"))';
  const claim = async () => {
    await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
    await staff.fill(`${SEC} input[name="code"]`, code);
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
  await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
  await staff.fill(`${SEC} input[name="code"]`, code);
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

  // and the collected win shows up in the diner's own history
  await diner.goto(`${BASE}/${SLUG}`, { waitUntil: "networkidle" });
  const histTxt = await diner.locator("main").innerText();
  check("collected item appears in diner history", /Récupéré/i.test(histTxt),
    histTxt.split("\n").find((l) => /Récupéré/i.test(l)) ?? "");
}

// ── 8. During cooldown the UI must not offer a doomed button ───────
await diner.goto(`${BASE}/${SLUG}/jeux`, { waitUntil: "networkidle" });
// wait for the cooldown text to hydrate (useSyncExternalStore fills it after
// mount) rather than guessing at a duration
await diner
  .waitForFunction(() => /Prochain tour/i.test(document.querySelector("main")?.innerText ?? ""), undefined, { timeout: 10000 })
  .catch(() => {});
const jeuxTxt = await diner.locator("main").innerText();
const spinnable = await diner.locator('button:has-text("Jouer")').count();
check(
  "cooldown is shown, not a button that 429s",
  /Prochain tour/i.test(jeuxTxt) && spinnable === 0,
  jeuxTxt.split("\n").find((l) => /dans /.test(l)) ?? "",
);

// ── 9. No wheel segment may hand out points (§00's core rule) ───────
const svgLabels = (await diner.locator("svg text").allInnerTexts())
  .map((t) => (t ?? "").trim())
  .filter(Boolean);
const pointsPrize = svgLabels.find((t) => /\bpoints?\b/i.test(t));
check(
  "no wheel segment awards points (points come only from buying)",
  !pointsPrize,
  pointsPrize ? `found "${pointsPrize}"` : svgLabels.filter(Boolean).join(", "),
);

// ── 10. Boutique: redeem debits points and issues a code ─────────────
// Top the account up so the cheapest reward (40) is affordable.
await credit(40, 67);

await diner.goto(`${BASE}/${SLUG}/boutique`, { waitUntil: "networkidle" });
diner.once("dialog", (d) => d.accept()); // confirm step
const redeemBtn = diner.locator('button:has-text("Échanger")').first();
const hadButton = await redeemBtn.count();
if (hadButton) {
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
  check(
    "redeem issues a code",
    gotCode,
    boutiqueTxt.match(/\b[A-Z2-9]{6}\b/)?.[0] ?? "no code",
  );

  await diner.goto(`${BASE}/${SLUG}`, { waitUntil: "networkidle" });
  const cardTxt = await diner.locator("main").innerText();
  check(
    "redeemed reward appears on Ma carte",
    /À MONTRER AU COMPTOIR|Espresso/i.test(cardTxt),
  );
} else {
  check("redeem button present when affordable", false, "no Échanger button");
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

  await staff.goto(`${BASE}/owner/reglages`, { waitUntil: "networkidle" });
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

  // and the change must actually reach the caisse
  const newPhone = `2${String(Date.now()).slice(-7)}`;
  await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
  await staff.fill('input[name="phone"]', newPhone);
  await staff.fill('input[name="amount"]', "10");
  await staff.locator('form:has(input[name="amount"]) button[type="submit"]').click();
  await staff.waitForSelector('[role="status"]', { timeout: 20000 }).catch(() => {});
  const rateTxt = await staff.locator('[role="status"]').innerText();
  check(
    "caisse uses the owner's new rate (10 TND x 3 = 30)",
    /\+30/.test(rateTxt) && /25 points de bienvenue/i.test(rateTxt),
    rateTxt.replace(/\n+/g, " · "),
  );

  // nonsense must be refused, not stored
  await staff.goto(`${BASE}/owner/reglages`, { waitUntil: "networkidle" });
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
  await admin.from("points_ledger").delete().eq("customer_phone", `+216${newPhone}`);
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

  const fresh = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const hops = [];
  fresh.on("framenavigated", (f) => {
    if (f === fresh.mainFrame()) hops.push(new URL(f.url()).pathname);
  });

  await fresh.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
  await fresh.fill('input[name="email"]', email);
  await fresh.fill('input[name="password"]', "Test-12345678");
  await fresh.click('button[type="submit"]');
  await fresh.waitForURL("**/owner/nouveau", { timeout: 20000 }).catch(() => {});

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
    fresh.url().endsWith("/owner") && !!biz,
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
  await admin.auth.admin.deleteUser(created.user.id);
}

// ── 13. Identity comes from the session, not the request body ────────
// Passing someone else's phone in the body must NOT let you play as them.
const anon = await browser.newPage();
await anon.goto(BASE, { waitUntil: "domcontentloaded" });
const anonStatus = await anon.evaluate(async (slug) => {
  const r = await fetch("/api/play", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug, phone: "+21620123456" }),
  });
  return r.status;
}, SLUG);
check("signed-out play rejected (401)", anonStatus === 401, `status=${anonStatus}`);

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
