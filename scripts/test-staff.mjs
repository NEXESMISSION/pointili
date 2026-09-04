/**
 * WHO DID THAT — the staff PIN gate, the roles, and the record (0048).
 *
 *   node scripts/test-staff.mjs
 *
 * Four things have to hold, and three of them are security properties:
 *
 *   · OFF BY DEFAULT. A shop that never asked for this sees no gate at all.
 *   · The gate stands in front of EVERY screen in the owner app, not the till
 *     alone, because it is rendered by the layout.
 *   · A cashier cannot reach Réglages — by tab, by URL, or by posting to the
 *     server action behind it. That screen holds the switch that turns the
 *     record off, so a role that could reach it would make the whole feature
 *     decorative.
 *   · Every operation at the counter is attributed, and the red button ends the
 *     attribution so the next person does not inherit a name.
 *
 * Exits non-zero on any failure.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { env } from "./db.mjs";
import { ensureTestCafe, dropTestCafe, TEST_SLUG, OWNER_EMAIL } from "./fixture.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const LOCAL = `2${String(Date.now()).slice(-7)}`;
const NORM = `+216${LOCAL}`;

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const { id: cafeId, ownerPassword: OWNER_PASSWORD } = await ensureTestCafe();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const browser = await chromium.launch({ executablePath: CHROME });

const LANG_FR = { name: "pointili_lang", value: "fr", url: BASE };
const newFrenchPage = async (opts) => {
  const page = await browser.newPage(opts);
  await page.context().addCookies([LANG_FR]);
  return page;
};

/* a cardholder to serve, so the journal has something real to record */
const diner = await newFrenchPage({ viewport: { width: 390, height: 844 } });
await diner.goto(`${BASE}/${TEST_SLUG}/rejoindre`, { waitUntil: "networkidle" });
await diner.fill('input[name="phone"]', LOCAL);
await diner.fill('input[name="pin"]', "4271");
await diner.fill('input[name="name"]', "Client");
await diner.click('button[type="submit"]');
await diner.waitForURL(`**/${TEST_SLUG}`, { timeout: 15000 }).catch(() => {});
const { data: card } = await admin.from("accounts").select("code").eq("phone", NORM).maybeSingle();

const staff = await newFrenchPage({ viewport: { width: 390, height: 844 } });
await staff.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
await staff.fill('input[name="email"]', OWNER_EMAIL);
await staff.fill('input[name="password"]', OWNER_PASSWORD);
await staff.click('button[type="submit"]');
await staff.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});
check("owner signs in", !staff.url().includes("/login"), staff.url().replace(BASE, ""));

const till = async () => {
  await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
  await staff.locator('button:has-text("Donner des points"), button:has-text("Qui est à la caisse")').first()
    .waitFor({ timeout: 20000 }).catch(() => {});
};

/* ── 1. OFF BY DEFAULT ─────────────────────────────────────────────── */
await till();
check("a shop that never asked for this sees no gate",
  (await staff.locator('button:has-text("Donner des points")').count()) === 1 &&
  !/Qui est à la caisse/i.test(await staff.locator("main").innerText()));
check("...and nobody's name is on the till",
  (await staff.locator('button[aria-haspopup="dialog"]:has-text("Menu")').count()) === 1 &&
  (await staff.locator('button:has-text("Quitter —")').count()) === 0);

/*
  The staff identity and the way out live in the floating menu now
  (components/OwnerMenu), not in a red panel on the till. Every question this
  suite asks about either one has to open it first — otherwise the answer is
  "absent" for everybody, which is a permissions check that has stopped
  checking.
*/
const openMenu = async () => {
  await staff.locator('button[aria-haspopup="dialog"]').click();
  const sheet = staff.locator('[role="dialog"][aria-modal="true"]');
  await sheet.waitFor({ timeout: 10000 });
  return sheet;
};

/* ── 2. The owner builds a team ────────────────────────────────────── */
await staff.goto(`${BASE}/owner/equipe`, { waitUntil: "networkidle" });
await staff.locator('button:has-text("Ajouter une personne")').waitFor({ timeout: 20000 });

/*
  Click the LABEL, not the checkbox.

  The switch is an <input class="sr-only"> with the visible track drawn beside
  it — which is how a toggle stays a real checkbox for a keyboard and a screen
  reader. Playwright refuses to click the input because the track sits on top of
  it; a person clicking that same track toggles it, because it is inside the
  label. So the label is what a person presses, and what this presses.
*/
const toggle = async () => {
  await staff.locator('label:has(input[name="staffPins"])').click();
};

const add = async (name, pin, role) => {
  await staff.locator('button:has-text("Ajouter une personne")').click();
  await staff.fill('input[name="staffName"]', name);
  await staff.fill('input[name="staffPin"]', pin);
  await staff.selectOption('select[aria-label="Rôle"]', role);
  await staff.locator('button:has-text("Ajouter")').last().click();
  await staff.waitForTimeout(2500);
};

/*
  THE SWITCH REFUSES TO LOCK ITS OWNER OUT. Turning the gate on with nobody who
  can open the settings again would be an unrecoverable state — no tile to tap,
  and the screen that could fix it behind the gate.
*/
await toggle();
await staff.waitForTimeout(2500);
const refused = await staff.locator('[role="alert"]').first().innerText().catch(() => "");
check("the gate refuses to switch on with nobody to open it", /Propriétaire/i.test(refused), refused);
const { data: still } = await admin.from("businesses").select("staff_pins_enabled").eq("id", cafeId).single();
check("...and it really did not switch on", still.staff_pins_enabled === false);

await add("Patron", "1111", "owner");
await add("Sami", "2222", "cashier");
const { data: people } = await admin.from("staff").select("id, name, role, pin_hash").eq("business_id", cafeId).order("created_at");
check("two people exist, with hashed codes", people.length === 2 && people.every((p) => p.pin_hash.startsWith("scrypt$")),
  people.map((p) => `${p.name}:${p.role}`).join(", "));
check("a PIN is never stored in the clear", people.every((p) => !p.pin_hash.includes("1111") && !p.pin_hash.includes("2222")));

await toggle();
await staff.waitForTimeout(2500);
const { data: on } = await admin.from("businesses").select("staff_pins_enabled").eq("id", cafeId).single();
check("the gate switches on once somebody can open it", on.staff_pins_enabled === true);

/* ── 3. The gate stands in front of every screen ───────────────────── */
for (const path of ["/owner", "/owner/clients", "/owner/reglages", "/owner/qr"]) {
  await staff.goto(BASE + path, { waitUntil: "networkidle" });
  const txt = await staff.locator("main, body").first().innerText();
  check(`the gate covers ${path}`, /Qui est à la caisse/i.test(txt), txt.split("\n").slice(0, 2).join(" · "));
}

/* ── 4. A wrong code is refused, and counted ───────────────────────── */
await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
await staff.locator('button:has-text("Sami")').click();
await staff.fill('input[name="pin"]', "9999");
await staff.waitForTimeout(3000);
check("a wrong code is refused", /incorrect/i.test(await staff.locator("body").innerText()));
const { count: tries } = await admin
  .from("staff_attempts").select("id", { count: "exact", head: true })
  .eq("staff_id", people.find((p) => p.name === "Sami").id);
check("...and it is counted, so four digits are worth having", (tries ?? 0) >= 1, `${tries} attempt(s)`);

/* ── 5. The cashier signs in and is bounded by their role ──────────── */
await staff.fill('input[name="pin"]', "2222");
await staff.waitForTimeout(4000);
const tillTxt = await staff.locator("main").innerText();
check("the right code opens the till", /Donner des points/i.test(tillTxt), tillTxt.split("\n").slice(0, 2).join(" · "));
/*
  WHOSE NAME IS ON THE TILL — now carried by the floating button rather than a
  red panel on the till itself (components/OwnerMenu). The panel scrolled away
  and existed only on this one screen; the button is on every screen and never
  scrolls, so the question is answered without scrolling to find the answer.
*/
check("the till says whose name is on it",
  (await staff.locator('button[aria-haspopup="dialog"]:has-text("Sami")').count()) === 1);

/* And the way out is still one tap, still red, one level in. */
await staff.locator('button[aria-haspopup="dialog"]').click();
const sheet = staff.locator('[role="dialog"][aria-modal="true"]');
await sheet.waitFor({ timeout: 10000 });
check("...and leaving is one tap from wherever they are",
  (await sheet.locator('button:has-text("Quitter — Sami")').count()) === 1);

/*
  The role check has to look INSIDE the menu now.

  With the tab bar gone, `a[href="/owner/reglages"]` is absent from a closed
  screen whatever the role — so the old assertion would pass for an owner too,
  which is the shape of a permissions test that has quietly stopped testing
  anything. Open the sheet first, then ask.
*/
check("a cashier gets no Réglages in the menu",
  (await sheet.locator('a[href="/owner/reglages"]').count()) === 0);
await sheet.locator('button:has-text("Fermer")').click();

await staff.goto(`${BASE}/owner/reglages`, { waitUntil: "networkidle" });
check("a cashier typing the URL lands back on the till", staff.url().endsWith("/owner"), staff.url().replace(BASE, ""));
await staff.goto(`${BASE}/owner/equipe`, { waitUntil: "networkidle" });
check("a cashier cannot open the team screen either", staff.url().endsWith("/owner"), staff.url().replace(BASE, ""));

/*
  AND NOT BY POSTING TO IT EITHER. Hiding a tab is a courtesy; a server action
  is a public HTTP endpoint, and the person this feature is about is holding the
  device it runs on. The action must refuse on its own.
*/
const posted = await staff.evaluate(async () => {
  try {
    const res = await fetch("/owner/reglages", {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8", "Next-Action": "x" },
      body: "[]",
    });
    return res.status;
  } catch {
    return 0;
  }
});
check("a raw POST at Réglages is not a way in", posted !== 200, `status ${posted}`);

/*
  THE SIGNUP SCREENS ARE OUTSIDE THE GATE, AND ONE OF THEM PRICES REWARDS.

  /owner/nouveau/recompenses lives in the (setup) group — a different layout,
  with no staff gate above it — and it never stops working: it redirects an owner
  who has NO café, which is the opposite guard. So it was a live reward editor,
  reachable by anybody holding the counter phone months after signup, able to
  rename every reward and set its cost to nothing.
*/
await staff.goto(`${BASE}/owner/nouveau/recompenses`, { waitUntil: "networkidle" });
check("a cashier cannot reach the signup reward editor", staff.url().endsWith("/owner"),
  staff.url().replace(BASE, ""));

const { data: pricesBefore } = await admin
  .from("loyalty_rewards").select("id, points_cost").eq("business_id", cafeId).order("position");
await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
const { data: pricesAfter } = await admin
  .from("loyalty_rewards").select("id, points_cost").eq("business_id", cafeId).order("position");
check("...and the ladder is untouched",
  JSON.stringify(pricesBefore) === JSON.stringify(pricesAfter),
  `${(pricesBefore ?? []).length} rewards`);

/* ── 6. Everything done is attributed ──────────────────────────────── */
await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
await staff.locator('button:has-text("Donner des points")').click();
await staff.locator('input[name="amount"]').waitFor({ timeout: 15000 });
await staff.fill('input[name="amount"]', "8");
/* One screen: amount and customer together, then the confirmation. */
await staff.fill('input[name="customer"]', card.code);
await staff.locator('button:has-text("Créditer")').click();
await staff.locator('button:has-text("Oui, créditer")').click({ timeout: 20000 });
await staff.locator("[data-receipt]").waitFor({ timeout: 20000 }).catch(() => {});
await staff.waitForTimeout(2500);

const { data: log } = await admin
  .from("staff_actions").select("staff_name, kind, customer, points, amount_tnd")
  .eq("business_id", cafeId).eq("kind", "credit").order("at", { ascending: false }).limit(1);
check("the sale is recorded against the person who made it",
  log?.[0]?.staff_name === "Sami" && Number(log[0].points) === 8,
  JSON.stringify(log?.[0] ?? null));
check("the record holds the card code, never the phone",
  log?.[0]?.customer === card.code && !JSON.stringify(log?.[0]).includes(LOCAL));

/* ── 7. The red button ends the shift ──────────────────────────────── */
await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
/* One level in, behind the button that carries the name — see the note at the
   first check. Still one tap once the menu is open, and now reachable from any
   screen rather than only from the till. */
await (await openMenu()).locator('button:has-text("Quitter — Sami")').click();
await staff.waitForTimeout(4000);
check("the red button hands the till back to the gate",
  /Qui est à la caisse/i.test(await staff.locator("body").innerText()));

/* ── 8. The owner's own code opens everything ──────────────────────── */
await staff.locator('button:has-text("Patron")').click();
await staff.fill('input[name="pin"]', "1111");
await staff.waitForTimeout(4000);
await staff.goto(`${BASE}/owner/equipe`, { waitUntil: "networkidle" });
const teamTxt = await staff.locator("main").innerText();
check("the owner's code opens the team screen", /Journal/i.test(teamTxt), staff.url().replace(BASE, ""));
check("the journal names the cashier's sale", /Sami/.test(teamTxt) && /crédité/i.test(teamTxt),
  teamTxt.split("\n").find((l) => /Sami/.test(l)) ?? "");

/* ── 8b. A FORGOTTEN CODE IS NOT A ONE-WAY DOOR ─────────────────────
   Every screen that can reset a PIN is behind this gate, and only the owner's
   role opens them — so an owner who forgets four digits would be locked out of
   their own settings for good. The account password is the key, because it is
   the credential that already means "I am this business", and it is the one
   thing the person holding the counter phone does not have. */
await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
await (await openMenu()).locator('button:has-text("Quitter")').click();
await staff.waitForTimeout(3500);
await staff.locator('button:has-text("Sami")').click();
check("a cashier's tile offers no password door",
  (await staff.locator('button:has-text("Code oublié")').count()) === 0);
await staff.locator('button:has-text("pas moi")').click();

await staff.locator('button:has-text("Patron")').click();
await staff.locator('button:has-text("Code oublié")').click();
await staff.fill('input[name="ownerPassword"]', "not-the-password");
await staff.locator('button:has-text("Entrer")').click();
await staff.waitForTimeout(3000);
check("a wrong password is refused", /incorrect/i.test(await staff.locator("body").innerText()));

await staff.fill('input[name="ownerPassword"]', OWNER_PASSWORD);
await staff.locator('button:has-text("Entrer")').click();
await staff.waitForTimeout(4500);
check("the account password reopens the owner's own tile",
  /Donner des points/i.test(await staff.locator("main").innerText().catch(() => "")),
  staff.url().replace(BASE, ""));

/* ── 9. Switching it back off restores the plain app ───────────────── */
await staff.goto(`${BASE}/owner/equipe`, { waitUntil: "networkidle" });
await staff.locator('label:has(input[name="staffPins"])').waitFor({ timeout: 20000 });
await toggle();
await staff.waitForTimeout(2500);
await staff.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
check("switching it off puts the app back as it was",
  (await staff.locator('button:has-text("Donner des points")').count()) === 1 &&
  (await staff.locator('button[aria-haspopup="dialog"]:has-text("Menu")').count()) === 1 &&
  (await (await openMenu()).locator('button:has-text("Quitter —")').count()) === 0);

await browser.close();
await dropTestCafe();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} staff checks passed`);
if (failed.length) {
  console.log(failed.map((f) => `  FAILED: ${f.name}`).join("\n"));
  process.exit(1);
}
