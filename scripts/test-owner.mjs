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
  /*
    Dismiss a receipt still on screen.

    It waits for a tap now instead of removing itself after four seconds — that
    is the point of it — so a suite that served somebody and then walked on
    would find every later click swallowed by the overlay. Tapping OK is what a
    cashier does, and it is what makes the reads between serve() and here safe:
    the receipt is still there while its values are read, and gone before
    anything else is pressed.
  */
  const ok = staff.locator('[data-receipt] button:has-text("OK")');
  if (await ok.count()) await ok.click().catch(() => {});
  await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
  await staff.locator('button:has-text("Donner")').waitFor({ timeout: 20000 });
};

/** Open a FICHE: corrections, history, the secret code. */
const openCustomer = async (who) => {
  /* The lookup left the till when the till went down to two acts; it travels as
     an address now (see components/OwnerMenu). The menu item that points here is
     exercised on its own further down. */
  await staff.goto(`${BASE}/owner?client=1`, { waitUntil: "networkidle" });
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
let lastConfirm = "";
const serve = async (who, amount) => {
  await till();
  /* /owner IS the counter now — there is no home screen to open, so the
     amount, the stamps, the camera and the field are already on screen. */
  if (amount !== null) {
    await staff.locator('input[name="amount"]').waitFor({ timeout: 15000 });
    await staff.fill('input[name="amount"]', String(amount));
  } else {
    /* Stamp-only: the stepper replaced the "+1 tampon" button, and it can go
       past one — which is why a cashier no longer scans the same card twice. */
    await staff.locator('button[aria-label="Un tampon de plus"]').click();
  }
  await staff.fill('input[name="customer"]', who);
  await staff.locator('.a-card:has(input[name="customer"]) button').click();
  /* The confirmation is where a wrong card is caught now — before the points
     move — so its wording is kept for the checks that used to read the
     receipt's. */
  const confirm = staff.locator('[role="dialog"]:not([data-nextjs-dialog])');
  await confirm.waitFor({ timeout: 20000 }).catch(() => {});
  lastConfirm = await confirm.innerText().catch(() => "");
  await staff.locator('button:has-text("Oui")').first().click({ timeout: 20000 });
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
      `${JSON.stringify(replay)} · balance ${before} → ${await bal()}`);

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
  ── THE TILL IS TWO ACTS, AND THE REST IS BEHIND ONE BUTTON ─────────────────

  The five-tab bar is gone from the phone. That is a large claim to make about
  a screen used all day, and it rests on two things being true at once: the
  till really does show only its two acts, and everything that left is really
  reachable. Either half alone is a regression — two buttons with no way to
  Réglages is an app with a missing half, and a menu over a cluttered till is
  just more clutter.

  So both are checked here, on the phone viewport this suite already uses.
*/
{
  await till();
  const acts = await staff.locator("main button, main a").count();
  const bodyTxt = await staff.locator("main").innerText();
  /*
    ONE SCREEN, NOT TWO ACTS BEHIND TWO BUTTONS.

    The home of two buttons is gone: /owner IS the counter. What used to be
    "Donner" and "Récompense" is one camera and one field that tell a card from
    a voucher by its shape, so the cashier never picks a mode — and the things
    that are not serving a customer (the lookup, the handover) are still behind
    the menu rather than on the screen.
  */
  check("the counter is one screen, with the amount and the field on it",
    (await staff.locator('input[name="amount"]').count()) === 1 &&
      (await staff.locator('input[name="customer"]').count()) === 1 &&
      !/Chercher un client/.test(bodyTxt) && !/Quitter —/.test(bodyTxt),
    `${acts} controls in main`);

  /* The button says a word, because a bare floating circle is a guess. */
  const fab = staff.locator('button[aria-haspopup="dialog"]');
  check("a floating button stands in for the tab bar", (await fab.count()) === 1);

  await fab.click();
  const sheet = staff.locator('[role="dialog"][aria-modal="true"]');
  await sheet.waitFor({ timeout: 10000 });
  const menuTxt = await sheet.innerText();
  /* Every destination the tab bar used to carry, plus the two that were only
     ever reachable from the till itself. */
  check("the menu carries every destination the bar did",
    ["Caisse", "Clients", "Mon QR", "Réglages"].every((t) => menuTxt.includes(t)),
    menuTxt.split(String.fromCharCode(10)).join(' · ').slice(0, 90));

  /* The promise made in the helpers above: the item still points at ?client=1.
     A menu that stops linking here would leave corrections unreachable, and
     every other check in this file would still pass. */
  await sheet.locator('a[href="/owner?client=1"]').click();
  /*
    Wait for the ADDRESS, not for the field.

    The counter carries an input[name="customer"] of its own now — it is the
    one field that takes a card, a phone or a voucher — so waiting for that
    element resolved instantly against the screen underneath the sheet, before
    the navigation had even begun. The sheet was then measured mid-flight and
    reported as still open, which it was, correctly.
  */
  await staff.waitForURL((u) => u.search.includes("client=1"), { timeout: 20000 }).catch(() => {});
  await staff.locator('button:has-text("Chercher")').waitFor({ timeout: 20000 }).catch(() => {});
  check("the menu opens the customer lookup",
    (await staff.locator('button:has-text("Chercher")').count()) === 1,
    new URL(staff.url()).search || "(no query)");
  /* And it gets out of the way once it has taken you somewhere. */
  check("the sheet closes once it has moved you", (await sheet.count()) === 0);
}

/*
  THE RECEIPT IS THE ONLY PLACE THE CUSTOMER APPEARS.

  A scan spends money before anybody's name is on screen, so the confirmation
  has to carry what a cashier needs to catch a wrong card in the second they
  have — and the answer to the question they are asked out loud. Both used to
  mean closing the confirmation and searching the same person again.
*/
/*
  THE CATCH MOVED EARLIER, WHICH IS THE WHOLE POINT.

  These used to read the RECEIPT, on the reasoning above: a scan spent the
  points the instant the lens decoded, so the receipt was the first place a
  cashier could see whose card they had just charged — the catch had to be there
  because there was nowhere earlier to put it.

  There is now. A scan identifies and asks, and the confirmation carries the
  name, the card code, whether the shop knows them, and the balance before and
  after — all of it BEFORE anything is spent. Asserting this on the receipt
  would now mean asserting that we tell a cashier who they charged after
  charging them.
*/
check("the confirmation names them and prints their card code",
  lastConfirm.includes("Habitué") && lastConfirm.includes(card.code),
  lastConfirm.split(String.fromCharCode(10)).join(" · ").slice(0, 90));
check("it says this shop knows them", /Client de la maison/i.test(lastConfirm));
check("it shows the balance MOVING, not just the new total", lastConfirm.includes("→"));
/* And the receipt still states what actually happened, in one line. */
check("the receipt states the outcome",
  /\+10/.test(credTxt) && /Solde/i.test(credTxt),
  credTxt.split(String.fromCharCode(10)).join(" · ").slice(0, 80));

/* ── 3. A bad amount is refused before anyone is even identified ──────
   The amount is keyed on its own screen now, so an impossible one never
   reaches a customer: the step simply does not open. */
await till();
await staff.locator('button:has-text("Donner")').click();
await staff.locator('input[name="amount"]').waitFor({ timeout: 15000 });
await staff.fill('input[name="amount"]', "-5");
const giveTxt = await staff.locator("main").innerText();
check("a negative amount is named as invalid", /Montant invalide/i.test(giveTxt),
  giveTxt.split("\n").find((l) => /invalide/i.test(l)) ?? giveTxt.split("\n").slice(0, 4).join(" · "));
/*
  There is no longer a door to carry a bad amount THROUGH — the amount and the
  customer live on one screen. So the guarantee moved: the camera runs from the
  moment the screen opens, and what stops a bad sale is the refusal, in words,
  when somebody is identified against an amount that is not a number.
*/
await staff.fill('input[name="customer"]', "ABCD");
await staff.locator('.a-card:has(input[name="customer"]) button').click();
const badAmountTxt = await staff
  .waitForSelector('main [role="alert"]', { timeout: 15000 })
  .then((el) => el.innerText())
  .catch(() => "");
check("...and it cannot be spent on anybody", /Montant invalide/i.test(badAmountTxt),
  badAmountTxt || "no refusal shown");
check("...and no confirmation was ever offered for it",
  (await staff.locator('button:has-text("Oui")').count()) === 0);

/* ── 3b. WHAT THE RECEIPT HAS TO SURVIVE ───────────────────────
   A scan spends money with no confirmation in front of it, so two things have
   to hold afterwards: the till must come back ready for the next customer on
   its own, and the undo must outlive the receipt — which takes itself off the
   screen after four seconds, usually while the cashier is bagging the order.

   The camera cannot be driven from a test and does not need to be: the lens and
   the code field pour into the same apply(), so the typed door exercises every
   line downstream of a read. */
/*
  A FAILED READ IS NOT A BALANCE OF ZERO.

  This was `Number(data ?? 0)`, which turns a dropped connection into the
  number zero — and zero is a perfectly plausible balance, so the suite
  reported it as fact. That is exactly how "…and nothing reached the ledger"
  came back as `0 → 37` on one run and `37 → 0` on the next: not a ledger
  moving, a read failing, in a different position each time. Two checks were
  accusing the till of losing money because the harness could not tell "I do
  not know" from "nothing".

  It retries — the cause is the transatlantic hop, not a refusal — and then
  says so out loud rather than answering with a number it does not have.
*/
const balanceNow = async () => {
  let last;
  for (let i = 0; i < 4; i++) {
    const { data, error } = await admin.rpc("pointili_balance", {
      p_business_id: cafeId,
      p_phone: NORM,
    });
    if (!error && data !== null) return Number(data);
    last = error;
    await staff.waitForTimeout(400 * (i + 1));
  }
  throw new Error(`balance unreadable: ${last?.message ?? "no data"}`);
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

/*
  ── THE RECEIPT WAITS, AND THERE IS NOTHING TO UNDO ─────────────────────────

  Both halves of this changed on purpose.

  It used to take itself off the screen after four seconds, which is why the
  undo had to outlive it — a cashier bagging an order missed the whole thing.
  It waits for a tap now, so the confirmation is one a cashier actually
  receives.

  And the undo is gone. It existed because a scan CREDITED the instant the lens
  decoded: the undo was the only pause anywhere in the flow. The pause moved to
  the confirmation, which carries the customer name and the arithmetic before
  anything is spent — a second one afterwards is the kind cashiers learn to tap
  through. A genuine mistake is a Correction on the customer fiche, which is
  where a reversal belongs and where it leaves a record.
*/
await staff.waitForTimeout(5500);
check("the receipt waits to be read rather than vanishing",
  (await staff.locator("[data-receipt]").count()) === 1);
check("...and offers no undo, because nothing was spent unasked",
  (await staff.locator('[data-receipt] button:has-text("Annuler")').count()) === 0);
await staff.locator('[data-receipt] button:has-text("OK")').click();
await staff.waitForTimeout(800);
check("...and OK returns the counter, ready for the next customer",
  (await staff.locator('input[name="amount"]').inputValue()) === "");

/* ── 3c. A VOUCHER IS NOT A CUSTOMER ──────────────────────────
   Both live behind the same lens and look identical in a customer's hand — 4
   characters against 6 (0019 / 0003). Handing a reward code to a half-finished
   sale must name the mistake and name the button that fixes it; "code
   introuvable" is what sent owners hunting a signup bug that did not exist.
   `main [role=alert]`: the Next dev overlay owns a role="alert" of its own. */
const strayBefore = await balanceNow();
await till();
/*
  ── A VOUCHER IS NOT REFUSED ANY MORE; IT IS SERVED ─────────────────────────

  This used to check that handing a reward code to a half-finished sale named
  the mistake and pointed at the other screen. There is no other screen: the
  counter's one field takes a card or a voucher and tells them apart by shape,
  so a voucher is no longer a wrong answer to the wrong question — it opens the
  reward it names.

  What still has to hold is the half that protects money: a voucher must not be
  credited as a customer, and a voucher that does not exist must say so rather
  than charge somebody.
*/
await staff.fill('input[name="amount"]', "9");
await staff.fill('input[name="customer"]', "ZZZZZZ");
await staff.locator('.a-card:has(input[name="customer"]) button').click();
await staff.waitForTimeout(3000);
const strayTxt = await staff.locator("main").innerText().catch(() => "");
check("an unknown voucher is named as unknown, not credited",
  /introuvable|invalide/i.test(strayTxt),
  strayTxt.split(String.fromCharCode(10)).filter(Boolean).slice(-2).join(" · "));
check("...and no confirmation to spend was ever offered",
  (await staff.locator('[role="dialog"] button:has-text("Oui")').count()) === 0);
const strayAfter = await balanceNow();
check("...and nothing reached the ledger", strayAfter === strayBefore,
  `${strayBefore} → ${strayAfter}`);


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
/*
  The lookup is not a button on the till any more — the till is two acts, and
  this is the third thing (see components/OwnerMenu). It lives in the floating
  menu and travels as an address, so that is what this opens. Clicking through
  the sheet instead would tie every one of these helpers to the menu's markup;
  the ADDRESS is the contract the menu itself uses, and test-owner exercises
  the sheet once so the item cannot silently stop linking here.
*/
await staff.goto(`${BASE}/owner?client=1`, { waitUntil: "networkidle" });
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
  if (!(await receipt.count())) return { text: "", code: "" };
  return { text: await receipt.innerText(), code: (await receipt.getAttribute("data-voucher")) ?? "" };
};
await stampOnce();
const full = await stampOnce();
/* data-voucher, not a scrape: /[A-Z2-9]{6,8}/ over a receipt matches any
   accented uppercase word whose tail is long enough — RÉCOMPENSE reads as
   COMPENSE. The receipt carries the code as an attribute for exactly this. */
const stampCode = full.code;
check("a full stamp card issues a code", /Carte pleine/i.test(full.text) && !!stampCode,
  stampCode || full.text.replace(/\n+/g, " · ").slice(0, 80));
check("the stamp receipt answers the points question too", /Solde/i.test(full.text));

/* ── 6. The counter validates that code exactly once ───────────────── */
/* No scoping any more: the voucher panel IS the screen behind its own button,
   so `main` is it. It has been a tab, then a card on a crowded home screen, and
   each move broke this helper in a way that looked like a broken till. */
const SEC = "main";
const collect = async (code) => {
  await till();
  /* A voucher goes in the same field a customer code does — the shape tells
     them apart (isVoucher), so the cashier never chooses a mode. */
  await staff.locator('input[name="customer"]').waitFor({ timeout: 15000 });
  await staff.fill('input[name="customer"]', code);
  await staff.locator('.a-card:has(input[name="customer"]) button').click();
  const btn = staff.locator('[role="dialog"] button:has-text("Remettre")');
  await btn.waitFor({ timeout: 10000 }).catch(() => {});
  if (await btn.count()) {
    await btn.click();
    /* The outcome lands in the same receipt a sale uses. */
    await staff.locator("[data-receipt]").waitFor({ timeout: 20000 }).catch(() => {});
  }
  const dlg = staff.locator('[role="dialog"]:not([data-nextjs-dialog])');
  return (await dlg.count()) ? dlg.innerText() : staff.locator(SEC).innerText();
};
if (stampCode) {
  const first = await collect(stampCode);
  check("code collects at the counter", /remis/i.test(first), first.replace(/\n/g, " · ").slice(0, 50));
  const again = await collect(stampCode);
  check("the same code cannot be reused", /déjà/i.test(again), again.replace(/\n/g, " · ").slice(0, 50));
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

/* ── N. A refused camera is not a missing one ──────────────────────────
   The till opens its lens on mount, which has NO user gesture behind it. A
   browser tab does not care — permission was granted long ago on this origin.
   An installed PWA is a fresh permission context: the prompt is suppressed and
   getUserMedia comes back NotAllowedError, which used to read exactly like a
   back-office laptop with no webcam. The cashier was dropped on the typed field
   for the rest of the shift, on a phone whose camera was perfectly fine.

   Its own context, because the stub below must not reach any other check. */
for (const [name, wants] of [
  ["NotAllowedError", { msg: "Autorise la caméra pour scanner.", button: "Autoriser", keepsLens: true }],
  ["NotReadableError", { msg: "La caméra est prise par une autre app.", button: "Réessayer", keepsLens: true }],
  ["NotFoundError", { msg: null, button: null, keepsLens: false }],
]) {
  const cam = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await cam.addCookies([LANG_FR]);
  await cam.addInitScript((n) => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new DOMException("stubbed", n)) },
    });
  }, name);
  const cp = await cam.newPage();
  await cp.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
  if (cp.url().includes("/login")) {
    await cp.fill('input[name="email"]', OWNER_EMAIL);
    await cp.fill('input[name="password"]', OWNER_PASSWORD);
    await cp.click('button[type="submit"]');
    await cp.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});
  }
  await cp.waitForTimeout(2500);
  const seen = await cp.evaluate(() => ({
    msg: document.querySelector("[data-camera]")?.textContent.trim() ?? null,
    buttons: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()),
    lens: !!document.querySelector("video"),
  }));
  check(
    `${name}: the till says what is actually wrong`,
    seen.msg === wants.msg &&
      (wants.button === null || seen.buttons.includes(wants.button)) &&
      seen.lens === wants.keepsLens,
    `${seen.msg ?? "no message"} · lens=${seen.lens}`,
  );
  await cam.close();
}

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
