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

/* Owned by the fixture's own plain-owner account, not the founder's. cafeB
   below inherits that owner_id, so neither shop shows up under a real login. */
const { id: cafeA } = await ensureTestCafe();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: ownerRow } = await admin.from("businesses").select("owner_id").eq("id", cafeA).single();

// a SECOND shop, so multi-card behaviour is real
/* dropTestCafe, not a raw delete: diner_cafes is NOT cascaded by the business
   FK (see fixture.mjs), so once any diner had joined the second shop, deleting
   the business row failed on referential integrity and took the whole suite
   with it. It only bit after a run crashed before its own cleanup, which is
   exactly when a suite most needs to be able to start from nothing. */
await dropTestCafe(OTHER);
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

/*
  THIS SUITE ASSERTS FRENCH, SO IT HAS TO ASK FOR FRENCH.

  The diner app now opens in Tunisian for a visitor with no preference — the
  country it is built for — and every check below reads copy: "Numéro ou code
  secret incorrect", "Bon retour", "déjà un compte". They started failing the
  moment the default flipped, which is the test being under-specified rather
  than the product being wrong: a check on wording must control the language it
  expects, not inherit whatever the default happens to be this month.

  Set once on the context, so every page this file opens carries it.
*/
const LANG_FR = { name: "pointili_lang", value: "fr", url: BASE };
const newFrenchPage = async (opts) => {
  const page = await browser.newPage(opts);
  await page.context().addCookies([LANG_FR]);
  return page;
};

const d = await newFrenchPage({ viewport: { width: 390, height: 844 } });

/* ── 1. Join shop A with a bare local number ──────────────────────── */
await d.goto(`${BASE}/${TEST_SLUG}/rejoindre`, { waitUntil: "networkidle" });
await d.fill('input[name="phone"]', LOCAL);
await d.fill('input[name="pin"]', PIN);
await d.fill('input[name="name"]', "Client");
await d.click('button[type="submit"]');
await d.waitForURL(`**/${TEST_SLUG}`, { timeout: 15000 }).catch(() => {});
check("join → lands on the card", d.url().endsWith(`/${TEST_SLUG}`), d.url().replace(BASE, ""));

// The code belongs to the ACCOUNT now, not to the card.
const { data: cardA } = await admin
  .from("accounts").select("code").eq("phone", NORM).maybeSingle();
check("signup issues a 4-char account code", cardA?.code?.length === 4, cardA?.code ?? "none");

/* ── 2. Every per-shop page renders with that real code ───────────── */
await d.goto(`${BASE}/${TEST_SLUG}/scanner`, { waitUntil: "networkidle" });
const scanTxt = await d.locator("main").innerText();
check("Ma carte shows the code (QR never gets an empty input)", scanTxt.includes(cardA.code), cardA.code);
check("Ma carte never shows the phone number", !scanTxt.includes(LOCAL) && !scanTxt.includes(NORM));

/*
  Needles that are not the page's own TITLE. /codes used to be checked for the
  words "Mes codes", which the top bar already says and the page then repeated
  in an H1 — so removing that duplication broke a passing test on a page that
  works. Each needle here is a sentence the screen exists to say.
*/
for (const [path, needle] of [
  ["/codes", "comptoir"],
  ["/historique", "points gagnés"],
  ["/profil", "Client"],
]) {
  await d.goto(`${BASE}/${TEST_SLUG}${path}`, { waitUntil: "networkidle" });
  const txt = await d.locator("main").innerText().catch(() => "");
  check(`${path} renders`, d.url().includes(path) && txt.includes(needle), d.url().replace(BASE, ""));
}

/* ── 3. Same person, phone typed WITH the country code, no plus ─────
   The classic duplicate-account trap: this must sign them back IN, not create a
   second identity that orphans their points. */
{
  const back = await newFrenchPage({ viewport: { width: 390, height: 844 } });
  await back.goto(`${BASE}/${TEST_SLUG}/rejoindre`, { waitUntil: "networkidle" });
  await back.locator('button:has-text("déjà un compte")').click();
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
  const t = await newFrenchPage({ viewport: { width: 390, height: 844 } });
  await t.goto(`${BASE}/${TEST_SLUG}/rejoindre`, { waitUntil: "networkidle" });
  await t.locator('button:has-text("déjà un compte")').click();
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
/*
  The whole point of moving the code to the account: ONE code, everywhere. Assert
  it through the UI of the second shop rather than by re-reading the row, so this
  catches a page that still renders a per-shop code.
*/
await d.goto(`${BASE}/${OTHER}/scanner`, { waitUntil: "networkidle" });
const scanB = await d.locator("main").innerText();
check("the SAME code works at every shop", scanB.includes(cardA.code), cardA.code);

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
/*
  The page is pick-then-commit now: choosing a reward highlights it, ONE button
  commits, and the code takes over the screen. So a repeat buy is
  reveal → "Échanger autre chose" → back to the picker → commit again.
*/
const buyOnce = async () => {
  await d.locator('form[data-redeem] button:has-text("Échanger")').first().click();
  /*
    ANSWER THE CONFIRMATION.

    Spending points asks first now — "Échanger 40 points contre Espresso
    offert ?" with the arithmetic — because a redeem debits a month of coffees
    and has no undo on the customer's side. The trigger opens the question; the
    button inside it is the one that submits.
  */
  await d.locator('button:has-text("Oui, échanger")').click({ timeout: 15000 });
  await d
    .waitForFunction(
      // [data-code], not a scrape of the panel's prose: the ticket's
      // "Recompense" header scans as COMPENSE once the accent is dropped.
      () => !!document.querySelector("[data-code]"),
      undefined,
      { timeout: 20000 },
    )
    .catch(() => {});
};

// remember what is on offer, so "still buyable" can mean something afterwards
const offered = await d.locator("main").innerText();
await buyOnce();
const buy1 = await d.locator("main").innerText();
const code1 = (await d.getAttribute("[data-code]", "data-code")) ?? "";
check("buying issues a counter code", !!code1, code1 || "none");
/* 0031 removed code expiry — a code keeps until it is used. The screen must
   SAY so, not merely omit the old countdown: silence would read as "we forgot
   to tell you", and the whole point is that the customer can relax. */
check(
  "the code says it has no deadline",
  /pas de date limite/i.test(buy1),
  (buy1.match(/Pas de date limite[^\n]*/i) ?? ["missing"])[0],
);

// back to the picker, then buy again — a diner with points may stack codes
await d.locator('button:has-text("Échanger autre chose")').click();
await d.locator('form[data-redeem] button:has-text("Échanger")').first().waitFor({ timeout: 10000 });
/* A reward is never consumed: it stays in the ladder and can be bought again.
   NOT asserted on the button label — after spending, it correctly reads
   "Encore N points" until the balance recovers. */
const back1 = await d.locator("main").innerText();
const firstReward = offered.match(/^(.+?)\n\s*\d+ points/m)?.[1]?.trim() ?? "";
check(
  "the reward stays listed after a purchase",
  Boolean(firstReward) && back1.includes(firstReward),
  firstReward || "no reward parsed",
);
await buyOnce();
await d.waitForTimeout(3000);
const { count: redemptions } = await admin
  .from("loyalty_redemptions").select("id", { count: "exact", head: true })
  .eq("business_id", cafeA).eq("phone", NORM);
check("a second purchase is possible (codes stack)", (redemptions ?? 0) >= 2, `redemptions=${redemptions}`);

/*
  ── THE COUNTER TAKES IT, AND THE SCREEN STOPS ASKING ──────────────────────

  After buying, the boutique shows one instruction full-screen: "fais scanner
  ça", the code, and the reward's name. The moment the cashier scans it that
  instruction is spent — and the screen used to stay up regardless, so the
  customer was left holding a code that no longer existed, being told to do a
  thing that had already happened. They had to press "Échanger autre chose" to
  leave a screen whose whole purpose had just been fulfilled.

  LivePoints already polls and already notices a code leaving the list — it is
  what raises the celebration — so it announces it and this screen steps aside,
  rather than a second poller being added to say the same thing.

  The code comes from the DATABASE, not from a regex over the screen: an
  earlier draft scraped it, matched the word "ESPRESSO" instead of a code, and
  skipped itself in silence — which is how a check ends up guarding nothing.
*/
{
  const { data: pending } = await admin.rpc("diner_codes", {
    p_business_id: cafeA,
    p_phone: NORM,
  });
  const shownText = await d.locator("main").innerText();
  const live = (pending ?? []).find((c) => shownText.includes(c.code))?.code ?? "";
  check("the reveal is showing one of their real codes", Boolean(live),
    `${(pending ?? []).map((c) => c.code).join("/")} vs ${shownText.slice(0, 50)}`);

  await admin.rpc("claim_code", { p_business_id: cafeA, p_code: live });
  /* One poll, plus the beat it waits so the celebration is what gets read. */
  const closed = await d
    .locator(`main:has-text("${live}")`)
    .waitFor({ state: "detached", timeout: 25000 })
    .then(() => true)
    .catch(() => false);
  check("the reveal closes itself once the counter has scanned it", closed,
    closed ? live : (await d.locator("main").innerText()).slice(0, 60));
}

/*
  ── THE ANSWER GOES MISSING AFTER THE POINTS ARE SPENT ─────────────────────

  The reported bug, and the worst shape a bug in this product can take: a
  customer redeemed, the points came off, and no code ever appeared.

  redeem_at_counter is one transaction, so the database cannot owe anybody a
  code — the debit and the code are written together. What can happen is that
  it COMMITS and the answer never gets back to the app: a dropped connection, a
  timeout, a 5xx after the commit. The client throws identically whether or not
  the work landed, and redeemAction used to answer all of them with "Échange
  impossible pour le moment" while the points were gone and the code existed.

  It now reconciles instead — it re-reads the codes and looks for one the diner
  was not holding before. THAT is what this checks: calling the RPC directly is
  exactly the case where the app never sees the answer, and the code has to be
  discoverable afterwards from the diner's own list, by nothing but a diff.

  Codes stack, so this compares code STRINGS, never a count.
*/
{
  const held = new Set(
    ((await admin.rpc("diner_codes", { p_business_id: cafeA, p_phone: NORM })).data ?? [])
      .map((c) => c.code),
  );

  const { data: reward } = await admin
    .from("loyalty_rewards").select("id,label").eq("business_id", cafeA)
    .eq("active", true).order("points_cost").limit(1).single();

  /* Commit a redeem the app will never receive the answer to. */
  const { data: lost } = await admin.rpc("redeem_at_counter", {
    p_business_id: cafeA, p_phone: NORM, p_reward_id: reward.id,
  });
  check("a redeem the app never hears back from still commits", lost?.ok === true, lost?.reason ?? "ok");

  const after = ((await admin.rpc("diner_codes", { p_business_id: cafeA, p_phone: NORM })).data ?? []);
  const fresh = after.filter((c) => !held.has(c.code));
  /* Exactly one: more than one would mean the diff cannot say which code was
     bought, and the customer would be shown somebody else's — or their own
     older — code as though it were the new one. */
  check("the lost code is recoverable from the diner's own list", fresh.length === 1,
    fresh.map((c) => c.code).join(",") || "none appeared");
  check("and it is the code that was actually minted",
    fresh[0]?.code === lost?.code, `${fresh[0]?.code} vs ${lost?.code}`);
}

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

/* ── 8. The global door: sign back in with no shop in hand ─────────── */
/*
  This is the hole /moi exists to close. After signing out, a diner used to have
  no way back to their own points without physically returning to a shop and
  rescanning its QR: /cartes bounced signed-out visitors to the B2B landing, and
  the only sign-in form lived under a shop slug.
*/
await d.goto(`${BASE}/cartes`, { waitUntil: "networkidle" });
check("signed out, /cartes sends you to the diner door (not the sales page)",
  d.url().endsWith("/moi"), d.url().replace(BASE, ""));

// wrong PIN must not reveal whether the number is known
await d.fill('input[name="phone"]', LOCAL);
await d.fill('input[name="pin"]', "9999");
await d.click('button[type="submit"]');
await d.locator('form [role="alert"]').waitFor({ timeout: 20000 }).catch(() => {});
const wrongTxt = await d.locator('form [role="alert"]').innerText().catch(() => "");
check("a wrong code is refused without naming the reason",
  /incorrect|essais/i.test(wrongTxt), wrongTxt);

// an unknown number gets the SAME answer — never an "is this person a customer?" oracle
await d.goto(`${BASE}/moi`, { waitUntil: "networkidle" });
await d.fill('input[name="phone"]', `2${String(Date.now()).slice(-7)}`);
await d.fill('input[name="pin"]', "9999");
await d.click('button[type="submit"]');
await d.locator('form [role="alert"]').waitFor({ timeout: 20000 }).catch(() => {});
const unknownTxt = await d.locator('form [role="alert"]').innerText().catch(() => "");
// Both must be non-empty AND identical — "" === "" would pass vacuously.
check("an unknown number gets the identical wording",
  Boolean(wrongTxt) && unknownTxt === wrongTxt,
  `"${unknownTxt}" vs "${wrongTxt}"`);

// and the real credentials land in the wallet, with every card
await d.goto(`${BASE}/moi`, { waitUntil: "networkidle" });
await d.fill('input[name="phone"]', LOCAL);
await d.fill('input[name="pin"]', PIN);
await d.click('button[type="submit"]');
await d.waitForURL((u) => u.pathname === "/cartes", { timeout: 20000 }).catch(() => {});
check("signing in at /moi lands in the wallet", d.url().endsWith("/cartes"), d.url().replace(BASE, ""));
/*
  THE ADDRESS ARRIVES BEFORE THE ANSWER DOES.

  /cartes has a loading.tsx now, so the URL changes the moment the transition
  starts and the column paints a skeleton while the server works. Reading the
  body on the next line used to be safe only because navigation BLOCKED — the
  address and the content landed together. It caught the skeleton, which has no
  text in it, and reported that a wallet with two shops in it had none.

  So wait for the thing being asserted rather than for the address. This is the
  wait that was always meant; it simply could not be told apart from the URL
  before there was anything between them.
*/
await d.locator("body").getByText(/Deuxième Boutique/).first()
  .waitFor({ timeout: 20000 }).catch(() => {});
const backTxt = await d.locator("body").innerText();
check("the wallet still holds both shops", /Deuxième Boutique/.test(backTxt) && /Café/.test(backTxt));
check("/moi never signs up — no account was invented for the unknown number",
  !/inscription|créer/i.test(await d.locator("body").innerText()));

/*
  ── A LOST SESSION IS NOT A LOST CARD ───────────────────────────────────
  The complaint this guards: "I'm sure the card was added, but I open the link
  again later and it makes me add it AGAIN." The session had ended — scanning
  from a different browser, a cleared history, a dropped cookie — and the only
  screen the product had for that was a signup form.

  Simulate it exactly: keep the device (and its hint), drop the session cookie.
*/
const jar = d.context();
const kept = (await jar.cookies()).filter((c) => c.name !== "pointili_diner");
await jar.clearCookies();
await jar.addCookies(kept);

await d.goto(`${BASE}/${TEST_SLUG}`, { waitUntil: "networkidle" });
const lost = await d.locator("main").innerText();
check("a returning customer is greeted, not asked to sign up", /Bon retour/i.test(lost),
  lost.split(String.fromCharCode(10)).find((l) => /retour|compte/i.test(l)) ?? "");
check("it says the card is still there", /toujours là|t'attend/i.test(lost));
check("it does not offer a new account", !/Nouveau compte/i.test(lost));

await d.fill('input[name="pin"]', PIN);
await d.locator('button[type="submit"]').first().click();
await d.waitForURL((u) => u.pathname === `/${TEST_SLUG}`, { timeout: 20000 }).catch(() => {});
/*
  Wait for the CARD, not for the address — the second place this bit me.

  /[slug] has a loading.tsx now, so the URL is the new one while the column is
  still a skeleton, and a skeleton has no digits in it. Reading main here used
  to be safe only because navigation blocked. It reported that a balance had
  been lost when the balance was simply not drawn yet, which is the worst
  possible false alarm on this particular check.
*/
await d.locator("main").getByText(/\d/).first().waitFor({ timeout: 20000 }).catch(() => {});
const reopened = await d.locator("main").innerText();
check("the secret code alone reopens the card", new URL(d.url()).pathname === `/${TEST_SLUG}`,
  new URL(d.url()).pathname);

/* and the points are the same ones — nothing was re-created */
const { count: cards } = await admin
  .from("diner_cafes")
  .select("phone", { count: "exact", head: true })
  .eq("phone", NORM)
  .eq("business_id", cafeA);
check("no second card was created", cards === 1, `${cards} card(s)`);
check("the balance survived the lost session", /\d/.test(reopened));

/*
  ── THE 404s THAT ARE REALLY TYPOS ──────────────────────────────────────
  iOS capitalises the first letter of anything typed into a field, messaging
  apps swallow the punctuation after a link, and a copied address arrives with
  a bracket on it. None of those can match a slug — they are lower case and
  [a-z0-9-] — so the product answered a one-character mistake with "ce café
  n'existe pas". proxy.ts tidies the URL instead.
*/
for (const [label, path] of [
  ["a capitalised address", `/${TEST_SLUG.toUpperCase()}`],
  ["a link with a full stop stuck to it", `/${TEST_SLUG}.`],
  ["a trailing slash", `/${TEST_SLUG}/`],
  ["a bracket a chat app left behind", `/${TEST_SLUG})`],
]) {
  await d.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  check(`${label} still reaches the café`,
    new URL(d.url()).pathname.startsWith(`/${TEST_SLUG}`),
    new URL(d.url()).pathname);
}

/* and a genuinely dead address sends a cardholder to their own cards, never
   to the sales page — the mistake this app has already made once, in /cartes */
await d.goto(`${BASE}/pas-un-cafe-du-tout`, { waitUntil: "networkidle" });
const dead = await d.locator("body").innerText();
check("a dead address offers the wallet", /Mes cartes/i.test(dead),
  dead.split(String.fromCharCode(10)).find((l) => /cartes/i.test(l)) ?? "");
check("a dead address never offers the sales page",
  (await d.locator('a[href="/"]').count()) === 0);

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
