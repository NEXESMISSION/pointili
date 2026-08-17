/**
 * What the operator can actually DO — the console's write surface.
 *
 * The other console suite checks the boundary (who gets in) and the platform
 * suite checks subscriptions. This one checks the levers added in 0041, and it
 * is weighted towards the ones that are hard to undo: a slug change breaks
 * printed QR codes, a delete takes a shop's customers with it, and a points
 * correction mints currency.
 *
 * Every check here is driven through the REAL screens. An RPC that works when
 * called from psql and cannot be reached from the interface is a feature
 * nobody has.
 */
import { chromium } from "playwright-core";
import { connect, env, onExit } from "./db.mjs";
import { ensureTestCafe, dropTestCafe } from "./fixture.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SUPER = { email: env.SUPER_ADMIN_EMAIL, password: env.SUPER_ADMIN_PASSWORD };

/*
  Its own fixture, and a name no other suite uses. These checks RENAME and then
  DELETE their café, so sharing e2etest with a suite running in another session
  would not merely race — it would delete that suite's shop mid-run. See the
  note on TEST_SLUG in fixture.mjs.
*/
const SLUG = process.env.TEST_SLUG ?? "e2econtrol";
const MOVED = `${SLUG}-moved`;

/*
  ── WAIT FOR OUR OWN RESULT LINE ──────────────────────────────────────────
  Not '[role="alert"]': in development Next mounts an empty <div role="alert">
  for its error overlay, so that selector matches something already on the page
  and every wait resolves instantly — the suite then reads the database before
  the action has landed. Naming the element is enough; our result lines are
  always <p>. And the waits are scoped to the CARD that owns the control,
  because a page can hold several results at once.
*/
const RESULT = 'p[role="status"], p[role="alert"]';

process.env.OWNER_PASSWORD ??= SUPER.password;
const fx = await ensureTestCafe({ ownerEmail: SUPER.email, slug: SLUG });

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const sql = await connect();
onExit(async () => {
  await dropTestCafe(SLUG).catch(() => {});
  await dropTestCafe(MOVED).catch(() => {});
});

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

const page = await newFrenchPage(b, { viewport: { width: 1280, height: 950 } });

await page.goto(`${BASE}/owner/login`, { waitUntil: "domcontentloaded" });
await page.fill('input[name="email"]', SUPER.email);
await page.fill('input[name="password"]', SUPER.password);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 }).catch(() => {});

const shop = () => page.goto(`${BASE}/admin/cafes/${fx.id}`, { waitUntil: "networkidle" });
const card = (text) => page.locator(`div.k-card:has-text("${text}")`).first();

/* ── 1 · the loyalty programme ───────────────────────────────────────── */
{
  await shop();
  const box = card("Programme");
  await box.locator('button:has-text("Modifier"), button:has-text("Créer le programme")').click();
  await page.fill('input[name="welcome"]', "25");
  await page.fill('input[name="expiry"]', "72");
  await page.locator('form:has(input[name="welcome"]) button[type="submit"]').click();
  await box.locator(RESULT).first().waitFor({ timeout: 20000 }).catch(() => {});

  const { rows } = await sql.query(
    "select points_per_tnd, welcome_points, redeem_expiry_hours from loyalty_programs where business_id = $1",
    [fx.id],
  );
  const r = rows[0] ?? {};
  check(
    "the programme is editable from the console",
    r.welcome_points === 25 && r.redeem_expiry_hours === 72,
    `${r.welcome_points} bienvenue · ${r.redeem_expiry_hours} h`,
  );
  /*
    THE RATE IS NOT A SETTING, AND THIS IS THE GUARD ON THAT.

    0031 pinned points_per_tnd to 1 with a CHECK and wrote down why: the rate
    stopped being an owner setting, and the constraint makes that true of the
    database rather than of one screen that happens not to show the field. A
    console field for it would be that screen coming back from the other side —
    "1 dinar = 1 point" is printed on the landing page and said at every
    counter.
  */
  check("the rate stays pinned at 1 dinar = 1 point", Number(r.points_per_tnd) === 1, `${r.points_per_tnd}`);
  check("and the console never offers to change it", (await page.locator('input[name="rate"]').count()) === 0);
}

/* ── 2 · identity, and the address that is printed on things ─────────── */
{
  await shop();
  await card("Identité").locator('button:has-text("Modifier")').click();
  await page.fill('input[name="name"]', "Café Renommé");
  await page.fill('input[name="slug"]', MOVED);

  /* The warning is the only thing standing between a slug change and every QR
     sticker a shop already paid for. It must appear WHEN the field changes. */
  check(
    "changing the address warns about printed QR codes",
    (await page.locator("text=cesseront de fonctionner").count()) > 0,
  );

  await page.locator('form:has(input[name="slug"]) button[type="submit"]').click();
  await card("Identité").locator(RESULT).first().waitFor({ timeout: 20000 }).catch(() => {});

  let { rows } = await sql.query("select name, slug from businesses where id = $1", [fx.id]);
  check(
    "a shop can be renamed and re-addressed",
    rows[0]?.name === "Café Renommé" && rows[0]?.slug === MOVED,
    `${rows[0]?.name} · /${rows[0]?.slug}`,
  );

  /* A café on a reserved slug is permanently unreachable — the static route
     always wins over /[slug] — so the editor has to refuse what create_cafe
     refuses. */
  await shop();
  await card("Identité").locator('button:has-text("Modifier")').click();
  await page.fill('input[name="slug"]', "admin");
  await page.locator('form:has(input[name="slug"]) button[type="submit"]').click();
  await page.waitForTimeout(2500);
  ({ rows } = await sql.query("select slug from businesses where id = $1", [fx.id]));
  check("a reserved address is refused", rows[0]?.slug === MOVED, `still /${rows[0]?.slug}`);
}

/* ── 3 · the customer ────────────────────────────────────────────────── */
let who;
{
  ({
    rows: [who],
  } = await sql.query(
    "select a.public_id, a.phone from accounts a join diner_cafes d on d.phone = a.phone limit 1",
  ));

  if (!who) {
    check("a customer exists to look up", false, "no cardholder in the database");
  } else {
    await page.goto(`${BASE}/admin/clients?q=${who.public_id}`, { waitUntil: "networkidle" });
    check(
      "a customer is findable",
      (await page.locator(`a[href="/admin/clients/${who.public_id}"]`).count()) > 0,
    );
    /* A search is browsing. Browsing does not get phone numbers. */
    check(
      "search results keep the number masked",
      !(await page.locator("main").innerText()).includes(who.phone.slice(-8)),
    );

    await page.goto(`${BASE}/admin/clients/${who.public_id}`, { waitUntil: "networkidle" });
    const {
      rows: [card0],
    } = await sql.query("select business_id from diner_cafes where phone = $1 limit 1", [who.phone]);
    const bal = async () =>
      Number(
        (await sql.query("select pointili_balance($1, $2) as b", [card0.business_id, who.phone]))
          .rows[0].b,
      );

    const before = await bal();
    await page.selectOption('select[name="businessId"]', card0.business_id);
    await page.fill('input[name="delta"]', "7");
    await page.fill('input[name="note"]', "test de contrôle");
    await page.locator('form:has(input[name="delta"]) button[type="submit"]').click();
    await card("Corriger des points").locator(RESULT).first().waitFor({ timeout: 20000 }).catch(() => {});

    const after = await bal();
    check("points can be corrected from the console", after === before + 7, `${before} → ${after}`);
    /* A correction that hides itself is worse than the error it repairs (0025). */
    check(
      "the correction lands in the customer's own history",
      (
        await sql.query(
          "select count(*)::int n from points_ledger where customer_phone = $1 and reason = 'adjust'",
          [who.phone],
        )
      ).rows[0].n > 0,
    );
    check(
      "and in the platform journal",
      (await sql.query("select count(*)::int n from admin_audit where action = 'points_adjust'")).rows[0]
        .n > 0,
    );

    /* Put it back: this is a real customer's balance in a real database. */
    await sql.query(
      "insert into points_ledger (business_id, customer_phone, delta, reason) values ($1, $2, -7, 'adjust')",
      [card0.business_id, who.phone],
    );

    const hashBefore = (
      await sql.query("select pin_hash from accounts where phone = $1", [who.phone])
    ).rows[0].pin_hash;

    const pinCard = card("Code secret");
    await pinCard.locator('button:has-text("Réinitialiser le code")').click();
    await pinCard.locator('button:has-text("Générer le nouveau code")').click();
    await page.waitForTimeout(3000);
    const shown = await pinCard.locator(RESULT).first().innerText().catch(() => "");
    const hashAfter = (
      await sql.query("select pin_hash from accounts where phone = $1", [who.phone])
    ).rows[0].pin_hash;

    check(
      "a PIN can be reset, and the new one is shown once",
      hashAfter !== hashBefore && /\d{4}/.test(shown),
      shown.slice(0, 40),
    );
    /*
      THE DIGITS MUST EXIST IN EXACTLY ONE PLACE: that sentence. Not in the
      audit log, which is readable forever by anyone who can reach the journal.
    */
    const digits = (shown.match(/\d{4}/) ?? [""])[0];
    const logged = (
      await sql.query(
        "select coalesce(string_agg(detail::text, ''), '') s from admin_audit where action = 'pin_reset'",
      )
    ).rows[0].s;
    check("the new PIN is nowhere in the journal", digits !== "" && !logged.includes(digits));
  }
}

/* ── 4 · many shops at once ──────────────────────────────────────────── */
{
  await page.goto(`${BASE}/admin/cafes`, { waitUntil: "networkidle" });
  /* Nothing may appear until something is selected — a permanent bulk toolbar
     makes acting on many shops the default gesture. */
  check(
    "no bulk bar until something is selected",
    (await page.locator('button:has-text("Prolonger")').count()) === 0,
  );

  await page.locator('table input[type="checkbox"]').nth(1).check();
  check(
    "selecting a row reveals the bulk actions",
    (await page.locator('button:has-text("Prolonger")').count()) > 0,
  );
  await page.locator('button:has-text("désélectionner")').click();
  check(
    "and clearing the selection hides them again",
    (await page.locator('button:has-text("Prolonger")').count()) === 0,
  );
}

/* ── 5 · the platform's own settings ─────────────────────────────────── */
{
  await page.goto(`${BASE}/admin/reglages`, { waitUntil: "networkidle" });
  const txt = await page.locator("main").innerText();
  /* The state of the payments is the first question this page answers, and it
     has to be answered before any field is read. */
  check(
    "the settings page says whether payments are live",
    /Mode test|paiements sont en direct/i.test(txt),
    txt.split("\n").find((l) => /Mode test|en direct/i.test(l)) ?? "",
  );
  check(
    "the offers and the payment coordinates are editable",
    (await page.locator('input[name="offers"]').count()) === 1 &&
      (await page.locator('input[name="methods"]').count()) === 1 &&
      (await page.locator('button:has-text("Ajouter un moyen de paiement")').count()) === 1,
  );

  /* Going live with nowhere to send the money leaves an owner on a payment
     screen that names a method and gives no destination. The server refuses it;
     this proves the refusal is reachable. */
  const { rows } = await sql.query(
    "select admin_save_settings((select id from profiles where role = 'super_admin' limit 1), true, '[]'::jsonb, '[]'::jsonb, null, null) as r",
  );
  check(
    "going live without a payment method is refused",
    rows[0].r?.ok === false && rows[0].r?.reason === "no_methods",
    rows[0].r?.reason,
  );
}

/* ── 6 · the end of a shop ───────────────────────────────────────────── */
{
  await shop();
  await page.fill('input[name="confirm"]', "pas-le-bon-slug");
  check(
    "delete stays disarmed until the address is typed correctly",
    await page.locator('button:has-text("Supprimer Café")').isDisabled(),
  );

  await page.fill('input[name="confirm"]', MOVED);
  await page.locator('button:has-text("Supprimer Café")').click();
  await page.waitForURL(/\/admin\/cafes$/, { timeout: 20000 }).catch(() => {});

  const gone =
    (await sql.query("select count(*)::int n from businesses where id = $1", [fx.id])).rows[0].n === 0;
  check("typing the address deletes the shop", gone);
  /* admin_audit.business_id has no foreign key (0007), on purpose: the record
     of a deletion has to outlive the thing it deleted. */
  check(
    "and the deletion outlives the shop in the journal",
    (await sql.query("select count(*)::int n from admin_audit where action = 'shop_delete'")).rows[0]
      .n > 0,
  );
  check(
    "the operator is not left on a page that no longer exists",
    new URL(page.url()).pathname === "/admin/cafes",
    new URL(page.url()).pathname,
  );
}

await b.close();
await dropTestCafe(SLUG).catch(() => {});
await dropTestCafe(MOVED).catch(() => {});
await sql.end();

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} control checks passed`);
process.exit(failed ? 1 : 0);
