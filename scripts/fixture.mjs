/**
 * A self-contained test café.
 *
 * The suite used to lean on a seeded "demo" café that also shipped to real users.
 * That's gone. Instead every test provisions its own throwaway café here, runs
 * against it, and tears it down — so the tests own their fixtures and the live
 * database carries no demo data between runs.
 *
 * The config mirrors what the old demo seed used (rate 1, welcome 10, a reward
 * ladder from 40, and a 6-segment wheel of REAL prizes) because the e2e's exact
 * numbers — floor(12.5 x 1) = 12, cheapest reward affordable at 67 — are tuned to
 * it.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { connect, env } from "./db.mjs";
import { shopLogo } from "./shop-logo.mjs";

/**
 * ONE SLUG, AND THAT IS A PROBLEM WHEN TWO PEOPLE TEST AT ONCE.
 *
 * Every suite here provisions its fixture at this address, against a database
 * that IS production. Two runs at the same time therefore fight over one café:
 * the second run's ensureTestCafe resets the plan the first one just granted,
 * and its teardown deletes the shop mid-assertion. The symptom is a suite that
 * fails eight checks with plausible-looking values — "trial → trial, +0 days",
 * "suspended café blocks diners" — every one of which reads as a real
 * regression in the code under test. That has now cost two debugging sessions.
 *
 * TEST_SLUG=whatever gives a run its own café. The default is unchanged, so a
 * normal `node scripts/e2e.mjs` behaves exactly as before; the sweeper
 * (sweep-test-data.mjs) still recognises the default name, so an abandoned
 * custom fixture is the one thing to clean up by hand.
 */
export const TEST_SLUG = process.env.TEST_SLUG ?? "e2etest";
/** The fixture shop's brand colour — deliberately not the house purple, so a
    screenshot proves the per-shop theming rather than the default. */
export const BRAND = "#0f6b4f";
export const TEST_NAME = "Café Test";

/**
 * THE FIXTURE OWNS ITS OWN ACCOUNT. It used to borrow the founder's.
 *
 * This defaulted to SUPER_ADMIN_EMAIL, and that one line caused every
 * production symptom reported against the live shop. Three separate ways:
 *
 *   1. ownerCafe() resolves "the owner's café" as the OLDEST one they own, and
 *      the fixture is deliberately backdated to 2000-01-01 to win that race
 *      (see the note in ensureTestCafe). So while the founder's own account
 *      owned the fixture, signing in to /owner served Café Test — not their
 *      real shop. Their café looked emptied because they were never looking
 *      at it.
 *   2. Every suite ends by dropping the fixture, so that shop then vanished
 *      out from under the same account mid-session: a card that "gets added
 *      again and again", a points balance that resets, a 404 on /e2etest.
 *   3. The founder is a super-admin, so every owner-app assertion ran with
 *      privileges a real owner does not have. The suite could not have caught
 *      an owner-facing permission bug, because it was never a plain owner.
 *
 * So the fixture provisions a dedicated account instead. Two properties make
 * it safe to have a permanent test login in a database that IS production:
 *
 *   · it is only ever an `owner` — never seeded into SUPER_ADMIN_EMAILS, so
 *     the console suites still have to use the real super-admin path, and the
 *     owner suites finally test the privileges an owner actually has.
 *   · its password is 32 random bytes, regenerated on every run and never
 *     written down — not in this repo, not in .env.local, not in CI config.
 *     The suite holds it in memory for the length of one run. Between runs
 *     nobody can sign in as it, including us.
 *
 * OWNER_EMAIL/OWNER_PASSWORD in the environment still override, for pointing
 * a suite at some specific account on purpose.
 *
 * ── THE ACCOUNT FOLLOWS THE SLUG ──────────────────────────────────────────
 *
 * TEST_SLUG gives a run its own café so two sessions cannot fight over one.
 * That is not enough on its own, and the gap is subtle: with one shared owner,
 * a second fixture puts TWO cafés under that account, and ownerCafe() resolves
 * "the owner's café" as the OLDEST one they own — while every fixture is
 * backdated to 2000-01-01 to win exactly that race. So the owner app served the
 * OTHER run's shop, and /owner/renouveler showed a pending request belonging to
 * a suite in another session. Four checks failed against a screen that was
 * behaving perfectly.
 *
 * So a custom slug gets a custom account. The default is untouched, so a plain
 * `node scripts/e2e.mjs` still signs in as e2e@pointili.test.
 */
export const OWNER_EMAIL =
  process.env.OWNER_EMAIL ??
  (TEST_SLUG === "e2etest" ? "e2e@pointili.test" : `${TEST_SLUG}@pointili.test`);

const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Make sure `email` exists as a plain owner and return a password that works
 * for exactly this run. Creates the account the first time, rotates the
 * password every time. Returns { id, password }.
 */
export async function ensureTestOwner(email = OWNER_EMAIL) {
  const override = process.env.OWNER_PASSWORD;

  /*
    NEVER touch an account this fixture did not create.

    Without this, pointing a suite at a real address — which test-walkin did,
    passing SUPER_ADMIN_EMAIL by hand — would have rotated a human being's
    password to a random string that is discarded seconds later, locking them
    out of their own console with no reset path but the service key. Only
    @pointili.test addresses are ours to provision. Anything else must be
    supplied with its password by whoever is aiming the suite at it.
  */
  const ours = email.endsWith("@pointili.test");
  if (!ours) {
    const c = await connect();
    try {
      const { rows } = await c.query("select id from profiles where email=$1", [email]);
      if (!rows.length) throw new Error(`owner not found in profiles: ${email}`);
      if (!override) {
        throw new Error(
          `refusing to set a password on ${email}: it is not a @pointili.test ` +
            `account. Pass OWNER_PASSWORD to use a real account, or drop ` +
            `OWNER_EMAIL to use the fixture's own.`,
        );
      }
      return { id: rows[0].id, password: override };
    } finally {
      await c.end();
    }
  }

  const password = override ?? `${randomBytes(32).toString("base64url")}aA1!`;

  const c = await connect();
  let id;
  try {
    const { rows } = await c.query("select id from profiles where email=$1", [email]);
    id = rows[0]?.id;
  } finally {
    await c.end();
  }

  if (id) {
    /* Rotate, so a password that leaked out of one run's memory is already
       dead by the next. Skipped when the caller supplied one on purpose. */
    if (!override) {
      const { error } = await svc.auth.admin.updateUserById(id, { password });
      if (error) throw error;
    }
    return { id, password };
  }

  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no inbox exists for @pointili.test, and none should
  });
  if (error) throw error;
  id = data.user.id;

  /* The profiles row arrives via a trigger on auth.users, but not necessarily
     before the next statement — and `role` must be 'owner', never 'super'. */
  const c2 = await connect();
  try {
    await c2.query(
      `insert into profiles (id, email, role) values ($1, $2, 'owner')
       on conflict (id) do update set email = excluded.email, role = 'owner'`,
      [id, email],
    );
  } finally {
    await c2.end();
  }
  return { id, password };
}

/*
  Labels, cost, position — and the drawn illustration each one carries.

  The art was added because a fixture with null image_url is a fixture that
  cannot show whether the card looks finished: every screenshot taken against
  it showed four identical gift glyphs, which is exactly the failure the
  drawings exist to fix. These paths are the same ones lib/rewardArt assigns in
  the product, so what the suites render is what a real shop gets.
*/
const REWARDS = [
  ["Espresso offert", 40, 0, "/rewards/espresso-offert.webp"],
  ["Cappuccino offert", 80, 1, "/rewards/cappuccino-offert.webp"],
  ["Pâtisserie du jour", 120, 2, "/rewards/patisserie-du-jour.webp"],
  ["Brunch complet", 300, 3, "/rewards/brunch-complet.webp"],
];

// Every segment is a REAL prize. Points come only from buying (§00).
const PRIZES = [
  ["Cookie offert", 28],
  ["Café offert", 12],
  ["-20% ta prochaine", 26],
  ["Croissant offert", 16],
  ["Sirop au choix", 12],
  ["Pâtisserie du jour", 6],
];

/** Delete a café (and its per-café data) on an already-open connection. */
async function dropOnConn(c, slug) {
  const { rows } = await c.query("select id from businesses where slug=$1", [slug]);
  if (!rows.length) return;
  // diner_cafes isn't cascaded by the business FK; clear it first, then the
  // business delete cascades ledger/rewards/prizes/games/wins/plays/redemptions.
  await c.query("delete from diner_cafes where business_id=$1", [rows[0].id]);
  await c.query("delete from businesses where slug=$1", [slug]);
}

/**
 * Provision a fresh test café owned by `ownerEmail`, wiping any leftover first.
 * Returns { id, slug }.
 */
export async function ensureTestCafe({ ownerEmail = OWNER_EMAIL, slug = TEST_SLUG } = {}) {
  /* Provisions the account and mints this run's password. Must happen before
     the connection below — it opens its own. */
  const { id: ownerId, password: ownerPassword } = await ensureTestOwner(ownerEmail);

  const c = await connect();
  try {
    await dropOnConn(c, slug);

    /*
      created_at is backdated ON PURPOSE.

      ownerCafe() resolves "the owner's café" as the OLDEST one they own (v1 is
      one café per owner). The moment the test account also owned a real café,
      the owner app started serving that one while the tests drove the fixture —
      every caisse check failed with "client introuvable" against a café the
      test had never touched. Backdating guarantees the fixture is the café the
      owner app resolves to, and keeps the suite off the real shop's data.
    */
    const biz = await c.query(
      `insert into businesses (owner_id, name, slug, status, primary_color, logo_url, created_at)
       values ($1, $2, $3, 'active', $4, $5, timestamptz '2000-01-01') returning id`,
      /* A colour and a mark, because a shop that has neither cannot show
         whether the customer's card looks like a shop's card. */
      [ownerId, TEST_NAME, slug, BRAND, await shopLogo(TEST_NAME, BRAND)],
    );
    const businessId = biz.rows[0].id;

    await c.query(
      `insert into loyalty_programs (business_id, active, points_per_tnd, welcome_points, redeem_expiry_hours)
       values ($1, true, 1, 10, 48)`,
      [businessId],
    );

    for (const [label, cost, pos, img] of REWARDS) {
      await c.query(
        `insert into loyalty_rewards (business_id, label, points_cost, active, position, image_url)
         values ($1, $2, $3, true, $4, $5)`,
        [businessId, label, cost, pos, img],
      );
    }

    const game = await c.query(
      `insert into games (business_id, type, active, config)
       values ($1, 'wheel', true, jsonb_build_object(
         'cooldownHours', 24, 'slotEnabled', false, 'qrGate', false,
         'gates', jsonb_build_array(), 'prizeConfig', jsonb_build_object()))
       returning id`,
      [businessId],
    );
    const gameId = game.rows[0].id;

    const prizeConfig = {};
    for (let i = 0; i < PRIZES.length; i++) {
      const [label, weight] = PRIZES[i];
      const r = await c.query(
        `insert into prizes (game_id, label, position, active) values ($1, $2, $3, true) returning id`,
        [gameId, label, i],
      );
      prizeConfig[r.rows[0].id] = { weight, isLose: false };
    }
    await c.query(
      `update games set config = config || jsonb_build_object('prizeConfig', $2::jsonb) where id = $1`,
      [gameId, JSON.stringify(prizeConfig)],
    );

    return { id: businessId, slug, ownerEmail, ownerPassword };
  } finally {
    await c.end();
  }
}

/** Remove the test café and everything under it. */
export async function dropTestCafe(slug = TEST_SLUG) {
  const c = await connect();
  try {
    await dropOnConn(c, slug);
  } finally {
    await c.end();
  }
}
