/**
 * The OWNER (admin) workflow, end-to-end in real Chrome.
 *
 *   node scripts/test-owner.mjs
 *
 * Guards what a shop owner and their cashier do every shift: credit by code or
 * number, add a stamp, validate a code at the counter, manage cardholders
 * (search / correct points / correct stamps / read history), and change every
 * settings section without one section blanking another. Exits non-zero on any
 * failure.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { env } from "./db.mjs";
import { ensureTestCafe, dropTestCafe, TEST_SLUG, OWNER_EMAIL } from "./fixture.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const LOCAL = `2${String(Date.now()).slice(-7)}`;
const NORM = `+216${LOCAL}`;
const PIN = "4271";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/* Both the café and the plain-owner account that owns it are minted here, with
   a password good for this run only. This used to sign in as the founder's
   super-admin, which served — and then dropped — a real shop. See fixture.mjs. */
const { id: cafeId, ownerPassword: OWNER_PASSWORD } = await ensureTestCafe();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const browser = await chromium.launch({ executablePath: CHROME });


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

/* a real cardholder to manage */
const diner = await newFrenchPage(browser, { viewport: { width: 390, height: 844 } });
await diner.goto(`${BASE}/${TEST_SLUG}/rejoindre`, { waitUntil: "networkidle" });
await diner.fill('input[name="phone"]', LOCAL);
await diner.fill('input[name="pin"]', PIN);
await diner.fill('input[name="name"]', "Habitué");
await diner.click('button[type="submit"]');
await diner.waitForURL(`**/${TEST_SLUG}`, { timeout: 15000 }).catch(() => {});
const { data: card } = await admin
  .from("accounts").select("code").eq("phone", NORM).maybeSingle();

/* ── 1. Owner signs in ─────────────────────────────────────────────── */
const staff = await newFrenchPage(browser, { viewport: { width: 390, height: 844 } });
await staff.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
if (staff.url().includes("/login")) {
  await staff.fill('input[name="email"]', OWNER_EMAIL);
  await staff.fill('input[name="password"]', OWNER_PASSWORD);
  await staff.click('button[type="submit"]');
  await staff.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});
}
check("owner signs in", !staff.url().includes("/login"), staff.url().replace(BASE, ""));

/*
  THE TILL IS A MENU OF TWO ACTS, each a little wizard:

     Donner des points      → an amount or a stamp → who → receipt
     Valider une récompense → a code or a QR       → collect

  Nothing is typed on the home screen, so any helper that starts by filling a
  field there is stale. The fiche is the third, quiet door and it no longer
  sells anything — the sale has a receipt and an undo, and two places to credit
  the same customer is two places to credit the WRONG one.
*/
const DESK = '[role="dialog"]';
const till = async () => {
  await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
  await staff.locator('button:has-text("Donner des points")').waitFor({ timeout: 20000 });
};

/** Open a FICHE: corrections, history, the secret code. */
const openCustomer = async (who) => {
  await till();
  await staff.locator('button:has-text("Chercher un client")').click();
  await staff.locator('input[name="customer"]').waitFor({ timeout: 15000 });
  await staff.fill('input[name="customer"]', who);
  await staff.locator('button:has-text("Chercher")').click();
  await staff.locator(DESK).waitFor({ timeout: 20000 }).catch(() => {});
};

/**
 * A whole sale, in the order a counter works: what, then who.
 *
 * `amount === null` is a stamp — the other way out of the first screen.
 * Returns the receipt locator, already waited for. READ ITS VALUES FIRST: it
 * takes itself off the screen four seconds after it appears, so an auto-waiting
 * call slipped in between (a `.textContent()` on an absent [role="alert"] waits
 * thirty seconds before it fails) arrives to find nothing.
 */
const serve = async (who, amount) => {
  await till();
  await staff.locator('button:has-text("Donner des points")').click();
  if (amount === null) {
    await staff.locator('button:has-text("+1 tampon")').click();
  } else {
    await staff.locator('input[name="amount"]').waitFor({ timeout: 15000 });
    await staff.fill('input[name="amount"]', String(amount));
    await staff.locator('button:has-text("Créditer")').click();
  }
  await staff.locator('input[name="customer"]').waitFor({ timeout: 15000 });
  await staff.fill('input[name="customer"]', who);
  await staff.locator('button:has-text("Confirmer")').click();
  const receipt = staff.locator("[data-receipt]");
  await receipt.waitFor({ timeout: 20000 }).catch(() => {});
  return receipt;
};

/* ── 2. Credit by the 4-char ACCOUNT code (privacy path) ───────────── */
const codeSale = await serve(card.code, 10);
const credTxt = (await codeSale.count()) ? await codeSale.innerText() : "";
check("credit by code works", /\+10/.test(credTxt), credTxt.split("\n").find((l) => /\+10/.test(l)) ?? "");
check("credit result hides the phone", !credTxt.includes(LOCAL) && !credTxt.includes(NORM));

/*
  ── THE SALE CARRIES ITS OWN IDENTITY ───────────────────────────────────────

  0049. credit_points is atomic, so the ledger is never half-written — but when
  the ANSWER is lost (the app is in Francfort, the database in Zurich) the till
  shows an error for a credit that actually landed, and the cashier, standing in
  front of a customer, taps again. Without a key that is a second real credit
  and the shop quietly pays for it.

  The database side is proved below. What is proved HERE is the wiring, which is
  the half that fails silently: a key minted in the browser, put on the form,
  validated in the action and written to the row. If any link in that chain
  breaks, op_key is null, the RPC has nothing to match on, and every guarantee
  underneath is decoration. So this asserts on the row the REAL till just wrote.
*/
{
  const { data: rows } = await admin
    .from("points_ledger").select("op_key,delta,reason")
    .eq("business_id", cafeId).eq("customer_phone", NORM).eq("reason", "earn");
  const keyed = (rows ?? []).filter((r) => r.op_key);
  check("a credit from the real till carries an idempotency key",
    keyed.length >= 1, `${keyed.length}/${rows?.length ?? 0} earn rows keyed`);

  /* And the key has to be the ACT's, not the request's: replaying it must move
     nothing. This is the retry the cashier makes, sent exactly as the till
     would send it. */
  const key = keyed[0]?.op_key;
  if (key) {
    const bal = async () =>
      (await admin.rpc("pointili_balance", { p_business_id: cafeId, p_phone: NORM })).data;
    const before = await bal();
    const { data: replay } = await admin.rpc("credit_points", {
      p_business_id: cafeId, p_phone: NORM, p_amount_tnd: 10, p_op_key: key,
    });
    check("the same sale sent twice is counted once",
      replay?.replayed === true && (await bal()) === before,
      `replayed=${replay?.replayed} balance ${before} → ${await bal()}`);

    /* The other half, and the one a lazy de-duplicator would fail: a genuinely
       separate sale — two customers, same coffee, same price — must still go
       through. A guard that swallows everything is worse than the bug. */
    const { data: fresh } = await admin.rpc("credit_points", {
      p_business_id: cafeId, p_phone: NORM, p_amount_tnd: 10,
      p_op_key: crypto.randomUUID(),
    });
    check("a second identical sale is still a sale",
      fresh?.replayed === false && (await bal()) > before,
      `balance ${before} → ${await bal()}`);
  }
}

/*
  THE RECEIPT IS THE ONLY PLACE THE CUSTOMER APPEARS.

  A scan spends money before anybody's name is on screen, so the confirmation
  has to carry what a cashier needs to catch a wrong card in the second they
  have — and the answer to the question they are asked out loud. Both used to
  mean closing the confirmation and searching the same person again.
*/
check("the receipt names them and prints their card code",
  credTxt.includes("Habitué") && credTxt.includes(card.code),
  credTxt.replace(/\n+/g, " · ").slice(0, 90));
check("it says this shop knows them", /Client de la maison/i.test(credTxt));
check("it shows the balance MOVING, not just the new total", credTxt.includes("→"));

/* ── 3. A bad amount is refused before anyone is even identified ──────
   The amount is keyed on its own screen now, so an impossible one never
   reaches a customer: the step simply does not open. */
await till();
await staff.locator('button:has-text("Donner des points")').click();
await staff.locator('input[name="amount"]').waitFor({ timeout: 15000 });
await staff.fill('input[name="amount"]', "-5");
const giveTxt = await staff.locator("main").innerText();
check("a negative amount is named as invalid", /Montant invalide/i.test(giveTxt),
  giveTxt.split("\n").find((l) => /invalide/i.test(l)) ?? giveTxt.split("\n").slice(0, 4).join(" · "));
check("...and it cannot be carried to a customer",
  await staff.locator('button:has-text("Créditer")').isDisabled());

/* ── 3b. WHAT THE RECEIPT HAS TO SURVIVE ───────────────────────
   A scan spends money with no confirmation in front of it, so two things have
   to hold afterwards: the till must come back ready for the next customer on
   its own, and the undo must outlive the receipt — which takes itself off the
   screen after four seconds, usually while the cashier is bagging the order.

   The camera cannot be driven from a test and does not need to be: the lens and
   the code field pour into the same apply(), so the typed door exercises every
   line downstream of a read. */
const balanceNow = async () => {
  const { data } = await admin.rpc("pointili_balance", { p_business_id: cafeId, p_phone: NORM });
  return Number(data ?? 0);
};
/* Poll, never sleep: every one of these round-trips to Postgres in Zurich. */
const balanceReaches = async (want) => {
  let b = 0;
  for (let i = 0; i < 20; i++) {
    b = await balanceNow();
    if (b === want) break;
    await staff.waitForTimeout(1000);
  }
  return b;
};

const beforeSale = await balanceNow();
const sale = await serve(card.code, 7);
const saleSeen = (await sale.count()) === 1;
const saleEarned = saleSeen ? Number(await sale.getAttribute("data-earned")) : NaN;
check("the two steps end in a receipt", saleSeen,
  saleSeen ? "" : (await staff.locator("main").innerText()).split("\n").slice(0, 5).join(" · "));
check("it carries what it just gave", saleEarned === 7, `data-earned=${saleEarned}`);
check("the ledger moved by exactly that", (await balanceReaches(beforeSale + 7)) === beforeSale + 7,
  `${beforeSale} → ${await balanceNow()}`);

await staff.waitForTimeout(5500);
check("the till comes back to its two buttons on its own",
  (await staff.locator('button:has-text("Donner des points")').count()) === 1);
const undoLine = staff.locator('main [role="status"]').first();
const undoBtn = undoLine.locator('button:has-text("Annuler")');
check("the undo outlives the receipt", (await undoBtn.count()) === 1,
  (await undoLine.innerText().catch(() => "")).replace(/\n/g, " · "));
if (await undoBtn.count()) {
  await undoBtn.click();
  check("...and it puts the sale back", (await balanceReaches(beforeSale)) === beforeSale,
    `balance=${await balanceNow()}`);
}

/* ── 3c. A VOUCHER IS NOT A CUSTOMER ──────────────────────────
   Both live behind the same lens and look identical in a customer's hand — 4
   characters against 6 (0019 / 0003). Handing a reward code to a half-finished
   sale must name the mistake and name the button that fixes it; "code
   introuvable" is what sent owners hunting a signup bug that did not exist.
   `main [role=alert]`: the Next dev overlay owns a role="alert" of its own. */
const strayBefore = await balanceNow();
await till();
await staff.locator('button:has-text("Donner des points")').click();
await staff.locator('input[name="amount"]').waitFor({ timeout: 15000 });
await staff.fill('input[name="amount"]', "9");
await staff.locator('button:has-text("Créditer")').click();
await staff.locator('input[name="customer"]').waitFor({ timeout: 15000 });
await staff.fill('input[name="customer"]', "ZZZZZZ");
await staff.locator('button:has-text("Confirmer")').click();
const strayTxt = await staff
  .waitForSelector('main [role="alert"]', { timeout: 15000 })
  .then((el) => el.innerText())
  .catch(() => "");
check("a reward code is named, not credited", /récompense/i.test(strayTxt), strayTxt.replace(/\n/g, " "));
check("...and the sale it interrupted is still armed",
  /9 DT/.test(await staff.locator("main").innerText()));
check("...and nothing reached the ledger", (await balanceNow()) === strayBefore);


/* ── 4. An unknown code is refused ─────────────────────────────────── */
/*
  Codes are platform-wide now, so a hard-coded "ZZZZ" is no longer safely
  unowned — it is well-formed and could legitimately belong to a real account,
  which would flip this from a false pass into a false failure (and a
  cross-tenant read: this suite runs against the real database). Find one that
  provably belongs to nobody.
*/
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let freeCode = "";
for (let i = 0; i < 50 && !freeCode; i++) {
  const c = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * 32)]).join("");
  const { data } = await admin.from("accounts").select("phone").eq("code", c).maybeSingle();
  if (!data) freeCode = c;
}
await till();
await staff.locator('button:has-text("Chercher un client")').click();
await staff.locator('input[name="customer"]').waitFor({ timeout: 15000 });
await staff.locator('input[name="customer"]').fill(freeCode);
await staff.locator('input[name="customer"]').press("Enter");
// no fiche opens, so the refusal shows on the screen that asked
const badCode = await staff
  .waitForSelector('main [role="alert"]', { timeout: 20000 })
  .then((el) => el.innerText())
  .catch(() => "");
// "introuvable" only: a VALIDATION rejection must never pass as a lookup miss.
check("an unknown customer code is refused", /introuvable/i.test(badCode), `${freeCode} → ${badCode}`);

/* ── 5. Stamps: enable in Réglages, then stamp at the till ─────────── */
await admin
  .from("loyalty_programs")
  .update({ stamps_enabled: true, stamps_required: 2, stamp_reward: "Café offert (test)" })
  .eq("business_id", cafeId);

/*
  A stamp is the other way out of the first screen, and it asks nothing extra:
  the identification step that follows IS the pause. The confirmation it used to
  raise existed because a stamp was one tap on an already-open fiche, and at
  9/10 that tap hands out the free coffee.
*/
const stampOnce = async () => {
  const receipt = await serve(card.code, null);
  return (await receipt.count()) ? receipt.innerText() : "";
};
await stampOnce();
const full = await stampOnce();
/* The receipt prints the voucher on its own line, under the reward's name —
   not inside a "… — code XXXXXX" sentence any more. */
const stampCode = full.match(/\b([A-Z2-9]{6,8})\b/)?.[1] ?? "";
check("a full stamp card issues a code", /Carte pleine/i.test(full) && !!stampCode,
  stampCode || full.replace(/\n+/g, " · ").slice(0, 80));
check("the stamp receipt answers the points question too", /Solde/i.test(full));

/* ── 6. The counter validates that code exactly once ───────────────── */
/* No scoping any more: the voucher panel IS the screen behind its own button,
   so `main` is it. It has been a tab, then a card on a crowded home screen, and
   each move broke this helper in a way that looked like a broken till. */
const SEC = "main";
const collect = async (code) => {
  await till();
  await staff.locator('button:has-text("Valider une récompense")').click();
  await staff.locator('input[name="code"]').waitFor({ timeout: 15000 });
  await staff.fill('input[name="code"]', code);
  await staff.locator(`${SEC} button:has-text("Vérifier")`).click();
  const btn = staff.locator(`${SEC} button:has-text("Collecter")`);
  await btn.waitFor({ timeout: 10000 }).catch(() => {});
  if (await btn.count()) {
    await btn.click();
    await staff.locator(`${SEC} [role="status"]`).waitFor({ timeout: 20000 }).catch(() => {});
  }
  return staff.locator(SEC).innerText();
};
if (stampCode) {
  const first = await collect(stampCode);
  check("code collects at the counter", /collecté/i.test(first), first.replace(/\n/g, " · ").slice(0, 50));
  const again = await collect(stampCode);
  check("the same code cannot be reused", /déjà.*utilisé/i.test(again), again.replace(/\n/g, " · ").slice(0, 50));
}

/* ── 7. Open the cardholder at the till, correct points + stamps ────
   The browsable "Mes clients" list was removed from the caisse, so a customer
   is reached the one way a cashier ever reaches one: by the code they show.
   The cross-shop probe that used to live here went with the list — it asked
   whether a stranger's code could be ENUMERATED out of a list that no longer
   exists. The isolation that still has teeth is the PIN reset, and that is
   guarded in scripts/attack.mjs. */
await openCustomer(card.code);
const listed = await staff
  .waitForFunction((c) => (document.querySelector('[role="dialog"]')?.innerText ?? "").includes(c), card.code, { timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check("the till opens a cardholder by code", listed, card.code);
const listTxt = await staff.locator(DESK).innerText();
check("the till never shows the raw phone", !listTxt.includes(NORM));
/* The fiche is now ONLY this: reading and correcting. Selling moved to its own
   two steps, and two places to credit the same customer is two places to credit
   the wrong one. */
check("the fiche sells nothing",
  (await staff.locator(`${DESK} input[name="amount"]`).count()) === 0 &&
  (await staff.locator(`${DESK} button:has-text("Créditer")`).count()) === 0);

/* No toggle to open: the corrections and the history ARE the fiche now. */
await staff.locator('input[name="adjust"]').fill("25");
const apply = staff.locator('button:has-text("Appliquer")');
await apply.waitFor({ state: "visible", timeout: 10000 });
await apply.click({ timeout: 15000 });
/* Poll the ledger rather than sleeping: the action round-trips to Zurich, so any
   fixed wait is a flake waiting to happen. */
let afterAdjust = 0;
for (let i = 0; i < 20; i++) {
  const { data } = await admin.rpc("pointili_balance", { p_business_id: cafeId, p_phone: NORM });
  afterAdjust = Number(data ?? 0);
  if (afterAdjust >= 25) break;
  await staff.waitForTimeout(1000);
}
check("owner can correct a balance", afterAdjust >= 25, `balance=${afterAdjust}`);

/* ── 8. Réglages: each editor saves only its own fields ────────────── */
/*
  THE RATE IS NOT A SETTING ANY MORE (0031): one dinar is one point, for every
  shop, with a CHECK on the column. So this section stopped asserting "the rate
  saves" and started asserting the opposite pair of truths:
    · the field is GONE from the screen, and
    · the value in the database IS 1 — because the server action no longer
      reads a rate from the form even if someone posts one.
*/
const earn = 'form:has(input[name="welcomePoints"])';
const openPoints = async () => {
  await staff.goto(`${BASE}/owner/reglages`, { waitUntil: "networkidle" });
  await staff.locator('button:has-text("Les points")').click();
  await staff.locator(`${earn} input[name="welcomePoints"]`).waitFor({ timeout: 15000 });
};
await openPoints();
check("the rate field is gone from Réglages",
  (await staff.locator('input[name="pointsPerTnd"]').count()) === 0);
check("the screen states 1 dinar = 1 point",
  /1\s*point/.test(await staff.locator(earn).innerText()));
await staff.locator(`${earn} input[name="welcomePoints"]`).fill("25");
await staff.locator(`${earn} button[type="submit"]`).click();
await staff.locator(`${earn} [role="status"], ${earn} [role="alert"]`).first().waitFor({ timeout: 20000 }).catch(() => {});
const { data: prog } = await admin
  .from("loyalty_programs")
  .select("points_per_tnd, welcome_points, stamps_enabled, stamps_required, stamp_reward")
  .eq("business_id", cafeId).single();
check("welcome saves and the rate stays 1",
  Number(prog.points_per_tnd) === 1 && prog.welcome_points === 25,
  `${prog.points_per_tnd} pt/TND · ${prog.welcome_points} welcome`);
check("saving points did NOT clobber the stamp settings",
  prog.stamps_enabled === true && prog.stamps_required === 2 && prog.stamp_reward === "Café offert (test)",
  `stamps=${prog.stamps_enabled}/${prog.stamps_required} reward=${JSON.stringify(prog.stamp_reward)}`);

/* ── 9. Analyses renders with real data ────────────────────────────── */
await staff.goto(`${BASE}/owner/clients`, { waitUntil: "networkidle" });
const stats = await staff.locator("main").innerText();
/* The page became "Vos clients" in the analytics rework — the word this
   asserts follows the heading, but the NaN guard is the check that matters. */
check("Clients/analyses renders (no crash, no NaN)", /Vos clients/i.test(stats) && !/NaN|Infinity|undefined/.test(stats));

/* ── 10. QR page shows the shop's own link ─────────────────────────── */
await staff.goto(`${BASE}/owner/qr`, { waitUntil: "networkidle" });
/*
  The href, not the page text. The QR screen is deliberately wordless now — the
  address lives in the code itself and in the "Voir la carte client" link, so
  reading innerText proved nothing about which café this page belongs to. This
  asserts the same property where it is actually true.
*/
const qrHref = await staff.locator('main a[href*="/"]').first().getAttribute("href");
check("QR page points at this shop's card", (qrHref ?? "").includes(TEST_SLUG), qrHref ?? "none");

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
await dropTestCafe();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} owner checks passed`);
process.exit(failed.length ? 1 : 0);
