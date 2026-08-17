/**
 * The early-access page, end to end.
 *
 * This is the one surface where a stranger writes to the database, and the row
 * they write is a lead — the only thing this product has before it has
 * customers. So the checks are about the two ways it can fail QUIETLY:
 *
 *   · a submission that looks accepted and is not there
 *   · a submission that is there and is not callable (a mistyped number)
 *
 * Both are invisible from the browser and both cost a customer, which is why
 * they are checked here rather than trusted to the form's own error states.
 */
import { chromium } from "playwright-core";
import { connect, onExit } from "./db.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

/* A block of numbers no real Tunisian shop can hold — 99 is not an allocated
   mobile prefix — so a suite that dies mid-run cannot leave a row that an
   operator would open WhatsApp for. */
const PREFIX = "+2169911";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const sql = await connect();
const wipe = () => sql.query(`delete from early_access_requests where phone like $1`, [`${PREFIX}%`]);
onExit(wipe);
await wipe();

const b = await chromium.launch({ executablePath: CHROME });
const ctx = () => b.newContext({ viewport: { width: 390, height: 844 } });

/** Fill the three fields and press the button. Returns the page. */
async function apply(page, { name, type, phone, honeypot = null }) {
  await page.fill("#name", name);
  await page.click(`#type-${type}`, { force: true });
  await page.fill("#phone", phone);
  if (honeypot) await page.fill("#company_url", honeypot);
  await page.click("button[type=submit]:has-text('anticip')");
  await page.waitForTimeout(1200);
  return page;
}

const row = async (local) => {
  const { rows } = await sql.query(
    `select * from early_access_requests where phone = $1`,
    [PREFIX + local],
  );
  return rows[0] ?? null;
};

/* ── 1. the happy path ─────────────────────────────────────────────────── */
{
  const page = await (await ctx()).newPage();
  await page.goto(`${BASE}/early`, { waitUntil: "networkidle" });

  check("the page offers exactly three fields",
    (await page.locator("#name").count()) === 1 &&
      (await page.locator("input[name=type]").count()) === 5 &&
      (await page.locator("#phone").count()) === 1,
    "name + 5 categories + phone");

  /* The whole argument of the page is that it does not ask for these. A field
     creeping back in is a regression nobody would file. */
  const asks = await page.locator("input[type=email], input[type=password], textarea").count();
  check("it asks for no e-mail, no password, no essay", asks === 0, `${asks} extra fields`);

  await apply(page, { name: "Café Test Early", type: "cafe", phone: "9911 00 01" });
  check("the thank-you replaces the form",
    (await page.locator("button[name=want]").count()) === 4,
    "the optional question is offered");

  const r = await row("0001");
  check("the lead is in the database", !!r, r?.business_name);
  /* The reason the +216 is furniture rather than something to type: a number
     that normalises differently is a number that cannot be called. */
  check("the number is stored callable", r?.phone === `${PREFIX}0001`, r?.phone);
  check("it starts as untouched work", r?.status === "new", r?.status);
  check("the category carries a real key", r?.business_type === "cafe", r?.business_type);

  /* The one question, and it is answered ONCE. The id travels in an httpOnly
     cookie, so this also proves the cookie round trip. */
  await page.locator("button[name=want][value=systeme]").click();
  await page.waitForTimeout(1000);
  check("the optional answer is recorded", (await row("0001"))?.want === "systeme");
  check("the thank-you closes the loop",
    (await page.locator("body").innerText()).includes("ça nous aide"),
    "no second ask");
}

/* ── 2. what it refuses ────────────────────────────────────────────────── */
{
  const page = await (await ctx()).newPage();
  await page.goto(`${BASE}/early`, { waitUntil: "networkidle" });

  /*
    Seven digits. This is the check that matters most and the one a form like
    this normally skips: normalisePhone turns "1100 02" into a perfectly valid
    +216 number, so without a Tunisian-length rule it is written down, looks
    fine in the console, and fails weeks later as a WhatsApp thread that never
    delivers.
  */
  await apply(page, { name: "Trop Court", type: "cafe", phone: "9911 000" });
  const alert = await page
    .locator("form [role=alert]").first().innerText().catch(() => "");
  check("a short number is refused, not stored",
    (await page.locator("button[name=want]").count()) === 0,
    "the form stayed on screen");
  /* And it says what is wrong in words, not just a red border — this form has
     no second chance and nobody debugs an aria attribute. */
  check("the refusal is legible", /8 chiffres/.test(alert), alert || "no message shown");

  const short = await sql.query(
    `select count(*)::int as n from early_access_requests where business_name = 'Trop Court'`,
  );
  check("nothing was written for it", short.rows[0].n === 0, `${short.rows[0].n} rows`);

  /* And the refusal has to be readable: an owner who cannot see why cannot fix
     it, and this form has no second chance. */
  check("it says which field is wrong",
    (await page.locator("#phone").getAttribute("aria-invalid")) === "true",
    "the phone field is marked");
}

/* ── 3. the honeypot ───────────────────────────────────────────────────── */
{
  const page = await (await ctx()).newPage();
  await page.goto(`${BASE}/early`, { waitUntil: "networkidle" });
  await apply(page, {
    name: "Bot Bot", type: "cafe", phone: "9911 00 03", honeypot: "http://spam.example",
  });

  /* It must LOOK like it worked. Telling a bot it was caught is telling it what
     to change. */
  check("a filled honeypot is answered normally",
    (await page.locator("button[name=want]").count()) === 4,
    "the thank-you is shown");
  check("…and writes nothing", (await row("0003")) === null);
}

/* ── 4. one lead per number ────────────────────────────────────────────── */
{
  /* An operator has already spoken to this shop. */
  await sql.query(
    `update early_access_requests set status = 'contacted', note = 'déjà appelé' where phone = $1`,
    [`${PREFIX}0001`],
  );

  const page = await (await ctx()).newPage();
  await page.goto(`${BASE}/early`, { waitUntil: "networkidle" });
  await apply(page, { name: "Café Test Renommé", type: "boutique", phone: "9911 00 01" });

  const { rows } = await sql.query(
    `select * from early_access_requests where phone = $1`, [`${PREFIX}0001`],
  );
  check("a second submission does not become a second lead", rows.length === 1, `${rows.length} rows`);
  check("the details are refreshed", rows[0]?.business_name === "Café Test Renommé");
  /*
    The one that would actually hurt: an owner tapping the button again must not
    drop their shop back into the "never contacted" queue, or it gets called a
    second time by somebody who thinks it is new.
  */
  check("but the pipeline is not rewound", rows[0]?.status === "contacted", rows[0]?.status);
  check("and the operator's note survives", rows[0]?.note === "déjà appelé");
  check("and their earlier answer is not erased", rows[0]?.want === "systeme", rows[0]?.want);
}

/* ── 5. the two headlines ──────────────────────────────────────────────── */
{
  const page = await (await ctx()).newPage();

  await page.goto(`${BASE}/early`, { waitUntil: "networkidle" });
  const plain = await page.locator("h1").innerText();

  await page.goto(`${BASE}/early?from=tag`, { waitUntil: "networkidle" });
  const tagged = await page.locator("h1").innerText();

  /*
    "Vos clients vous réclament" is a claim about real people, and it is only
    true for a shop that was actually named by its customers. The parameter is
    the whole guard — if it ever leaked onto the general page it would be a lie
    in the first six words anyone reads about us.
  */
  check("the general page does not claim customers asked for them",
    !/réclament/i.test(plain), plain.replace(/\n/g, " "));
  check("the tagged link does", /réclament/i.test(tagged), tagged.replace(/\n/g, " "));

  const src = await row("0001");
  check("where they came from is written down", src?.source === "direct", src?.source);
}

/* ── 6. and it reaches the console ─────────────────────────────────────── */
{
  const { rows } = await sql.query(
    `select * from admin_early_access(
       (select id from profiles where role = 'super_admin' limit 1), 200)
      where phone like $1`, [`${PREFIX}%`],
  );
  check("the console can read the list", rows.length >= 1, `${rows.length} leads`);

  const stats = await sql.query(
    `select admin_early_access_stats(
       (select id from profiles where role = 'super_admin' limit 1), 30) as s`,
  );
  /* The denominator is the point of the panel — a lead count with no visit
     count behind it cannot answer whether the page works. */
  check("the funnel reports both halves",
    typeof stats.rows[0].s?.visits === "number" && typeof stats.rows[0].s?.total === "number",
    `${stats.rows[0].s?.total} demandes / ${stats.rows[0].s?.visits} visites`);
}

await b.close();
await wipe();
await sql.end();

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} early-access checks passed`);
process.exit(failed ? 1 : 0);

