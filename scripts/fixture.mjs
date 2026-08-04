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
import { connect, env } from "./db.mjs";
import { shopLogo } from "./shop-logo.mjs";

export const TEST_SLUG = "e2etest";
/** The fixture shop's brand colour — deliberately not the house purple, so a
    screenshot proves the per-shop theming rather than the default. */
export const BRAND = "#0f6b4f";
export const TEST_NAME = "Café Test";
export const OWNER_EMAIL = process.env.OWNER_EMAIL ?? env.SUPER_ADMIN_EMAIL;

/*
  Labels, cost, position — and the drawn illustration each one carries.

  The art was added because a fixture with null image_url is a fixture that
  cannot show whether the card looks finished: every screenshot taken against
  it showed four identical gift glyphs, which is exactly the failure the
  drawings exist to fix. These paths are the same ones lib/rewardArt assigns in
  the product, so what the suites render is what a real shop gets.
*/
const REWARDS = [
  ["Espresso offert", 40, 0, "/rewards/espresso-offert.png"],
  ["Cappuccino offert", 80, 1, "/rewards/cappuccino-offert.png"],
  ["Pâtisserie du jour", 120, 2, "/rewards/patisserie-du-jour.png"],
  ["Brunch complet", 300, 3, "/rewards/brunch-complet.png"],
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
  const c = await connect();
  try {
    const { rows } = await c.query("select id from profiles where email=$1", [ownerEmail]);
    if (!rows.length) throw new Error(`owner not found in profiles: ${ownerEmail}`);
    const ownerId = rows[0].id;

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

    return { id: businessId, slug };
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
