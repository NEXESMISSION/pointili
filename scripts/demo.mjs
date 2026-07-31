/**
 * One believable café, with ninety days of history behind it.
 *
 *   node scripts/demo.mjs           # provision (idempotent — drops first)
 *   node scripts/demo.mjs --drop    # remove every trace
 *
 * WHAT IT IS FOR. Every screen that reports on a shop — Analyses above all —
 * only exists once there is data, and a brand-new café has none. So the product
 * has never been seen doing the thing it is sold for: showing an owner whether
 * their customers come back. This provisions a shop where that question has a
 * real answer, for screenshots, for a demo across a table, and for judging the
 * design against numbers instead of an empty state.
 *
 * ─── EVERY VISIBLE STRING IS A REAL ONE ───────────────────────────────────
 * This existed once with a `demo-` slug and an @example.com owner, and it was
 * worthless: the whole point is to be screenshotted and shown to a café owner,
 * and the first thing they read is the address bar and the Identifiant row. A
 * shop called "demo" is not a demo of anything.
 *
 * So nothing a viewer can see says test:
 *   - Café El Manar, at pointili.online/cafe-el-manar
 *   - Identifiant elmanar@pointili.online — a real address on a domain WE own,
 *     which is the one way to look right and still be certain it can never
 *     collide with a stranger's mailbox. No mail is ever sent to it: the account
 *     is created with email_confirm already true.
 *   - customers on real Tunisian mobile prefixes (20/21/22/25/26/27/28/29,
 *     50…59, 90…99), not a made-up range
 *   - Tunisian first names, dinar amounts a café actually takes
 *
 * ─── AND IT WRITES TO PRODUCTION ──────────────────────────────────────────
 * There is no separate test project, so looking real cannot mean being
 * untraceable. What makes it safe is not the naming, it is this:
 *
 *   - `--drop` finds its customers through diner_cafes for THIS café, never by
 *     guessing at a phone prefix, and only deletes an account once it holds no
 *     card anywhere. A real customer who happens to share a number keeps theirs.
 *   - a generated number that already belongs to somebody is skipped, not
 *     reused, so the demo can never attach a card to a real person's account.
 *   - scripts/sweep-test-data.mjs knows the café by name and leaves it alone
 *     unless asked with --with-demo. Tidying up after a crashed test suite must
 *     not delete the shop somebody is about to demo.
 *   - it gets its OWN owner account, so ownerCafe() — which resolves the oldest
 *     café an owner holds — can never serve demo data to the person paying.
 *
 * ─── WHY IT WRITES SQL AND NOT RPCs ───────────────────────────────────────
 * credit_points() stamps now(). Ninety days of history cannot be built by an
 * API that can only mean "today", so the ledger rows are inserted directly with
 * their real timestamps. Every number Analyses shows is then derived by the same
 * code path as production — nothing here fakes a statistic, it only fakes the
 * past that produces one.
 */
import { randomBytes, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { connect, env } from "./db.mjs";

const scrypt = promisify(_scrypt);

/*
  The same format lib/auth/crypto.ts writes: scrypt$salt$key, 16-byte hex salt,
  64-byte key. Duplicated rather than imported because that module is TypeScript
  and server-only, and this is a plain script — but it MUST stay in step, so if
  the scheme there ever changes, the showcase customer stops being able to sign
  in and this is where to look.
*/
const hashPin = async (pin) => {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(pin, salt, 64);
  return `scrypt$${salt}$${key.toString("hex")}`;
};

/* One customer you can actually sign in as, so the demo has a customer side and
   not only a dashboard. Everyone else is deliberately un-signable. */
const SHOWCASE_PIN = "2468";

const DROP = process.argv.includes("--drop");

const SLUG = "cafe-el-manar";
const NAME = "Café El Manar";
const OWNER_EMAIL = "elmanar@pointili.online";
const OWNER_PASSWORD = process.env.DEMO_PASSWORD ?? "ElManar2026";

/* Real Tunisian mobile prefixes. Numbers are drawn from these rather than from
   one invented block, because a caisse screenshot shows them and a column of
   +216 55 1xx xxx reads as generated. */
const PREFIXES = [
  "20", "21", "22", "23", "24", "25", "26", "27", "28", "29",
  "50", "51", "52", "53", "54", "55", "56", "58", "59",
  "90", "91", "92", "93", "94", "95", "96", "97", "98", "99",
];

/*
  Priced in VISITS, which is the only unit either side of the counter thinks in.

  This shop used to run at 1 point per dinar against a 200-point espresso —
  200 dinars of coffee, roughly eighty visits, for one free espresso. Nobody
  would ever have got there, and the showcase was quietly demonstrating a
  loyalty programme that does not work. Worse, at 1 pt/DT a 2,5 DT café earned
  2 points and the half dinar was thrown away (see migration 0026).

  At 10 pt/DT the arithmetic is legible: a ~6 DT ticket here is 60 points, the
  mint tea at 400 is about seven visits, and the welcome bonus is already a
  quarter of the way there. 10 also divides the half-dinar amounts this
  generator produces exactly, so no fraction is invented that a real till
  would have banked.
*/
const RATE = 10;
const WELCOME = 100;

const REWARDS = [
  ["Thé à la menthe", 400, "/rewards/the-a-la-menthe.png"],
  ["Espresso offert", 450, "/rewards/espresso-offert.png"],
  ["Cappuccino offert", 550, "/rewards/cappuccino-offert.png"],
  ["Croissant offert", 600, "/rewards/croissant-offert.png"],
  ["Pâtisserie du jour", 850, "/rewards/patisserie-du-jour.png"],
  ["Brunch complet", 1800, "/rewards/brunch-complet.png"],
];

/*
  Deterministic randomness. A demo that reshuffles on every run cannot be
  screenshotted twice, and a bug that only appears at one seed is impossible to
  reproduce. mulberry32 — small, and good enough for fake coffees.
*/
let seed = 20260730;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + rnd() * (hi - lo);

const NAMES = [
  "Yassine", "Amine", "Mohamed", "Nour", "Sarra", "Rania", "Hedi", "Salma",
  "Karim", "Mariem", "Anis", "Ines", "Bilel", "Chaima", "Walid", "Farah",
  "Sofiane", "Dorra", "Mehdi", "Asma", "Nizar", "Emna", "Hamza", "Syrine",
  "Oussama", "Malek", "Rim", "Ghassen", "Nesrine", "Tarek", "Jihed", "Amal",
  "Slim", "Wafa",
];

const DAY = 86_400_000;
const now = Date.now();

const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = await connect();

/* ── teardown ─────────────────────────────────────────────────────────── */
async function drop() {
  const { rows } = await sql.query("select id from businesses where slug=$1", [SLUG]);

  /*
    Its customers are whoever holds a card HERE — read before the café goes, and
    never guessed from the phone number. The numbers look real now, so "looks
    fake" was never a safe test and is no longer even available.
  */
  let phones = [];
  if (rows.length) {
    const id = rows[0].id;
    phones = (
      await sql.query("select phone from diner_cafes where business_id=$1", [id])
    ).rows.map((r) => r.phone);

    // diner_cafes is not cascaded by the business FK, so it goes first.
    await sql.query("delete from diner_cafes where business_id=$1", [id]);
    await sql.query("delete from businesses where id=$1", [id]);
  }
  if (phones.length) {
    /*
      Only accounts left holding NO card anywhere. If one of these numbers turned
      out to belong to a real customer of a real shop, their account and their
      other cards survive — the card they held here is all that goes.
    */
    await sql.query(
      `delete from accounts a
        where a.phone = any($1)
          and not exists (select 1 from diner_cafes d where d.phone = a.phone)`,
      [phones],
    );
  }

  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
  const owner = data.users.find((u) => u.email === OWNER_EMAIL);
  if (owner) await svc.auth.admin.deleteUser(owner.id);

  return { cafe: rows.length, phones: phones.length, owner: Boolean(owner) };
}

if (DROP) {
  const gone = await drop();
  console.log(`dropped — café:${gone.cafe} phones:${gone.phones} owner:${gone.owner}`);
  await sql.end();
  process.exit(0);
}

/* ── owner ────────────────────────────────────────────────────────────── */
await drop(); // idempotent: a re-run replaces rather than duplicates

const { data: made, error: authErr } = await svc.auth.admin.createUser({
  email: OWNER_EMAIL,
  password: OWNER_PASSWORD,
  email_confirm: true,
});
if (authErr) throw authErr;
const ownerId = made.user.id;
await sql.query(
  `insert into profiles (id, email, role) values ($1,$2,'owner')
     on conflict (id) do update set email = excluded.email`,
  [ownerId, OWNER_EMAIL],
);

/* ── the shop ─────────────────────────────────────────────────────────── */
const opened = new Date(now - 96 * DAY);
const { rows: bizRows } = await sql.query(
  `insert into businesses (owner_id, name, slug, status, primary_color, business_type, plan, plan_expires_at, created_at)
   values ($1,$2,$3,'active','#5b3fd1','cafe','pro',$4,$5) returning id`,
  [ownerId, NAME, SLUG, new Date(now + 300 * DAY), opened],
);
const biz = bizRows[0].id;

await sql.query(
  `insert into loyalty_programs (business_id, active, points_per_tnd, welcome_points, redeem_expiry_hours)
   values ($1,true,$2,$3,48)`,
  [biz, RATE, WELCOME],
);

const rewardIds = [];
for (let i = 0; i < REWARDS.length; i++) {
  const [label, cost, img] = REWARDS[i];
  const { rows } = await sql.query(
    `insert into loyalty_rewards (business_id, label, points_cost, image_url, active, position, created_at)
     values ($1,$2,$3,$4,true,$5,$6) returning id`,
    [biz, label, cost, img, i, opened],
  );
  rewardIds.push({ id: rows[0].id, label, cost });
}

/* ── customers ────────────────────────────────────────────────────────── */
/*
  Three populations, because a real shop has three and the retention figure is
  meaningless without them. All-regulars would show 100% and read as a lie; all
  one-timers would show 0% and hide the feature.
*/
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const usedCodes = new Set();
const mintCode = () => {
  for (;;) {
    const c = Array.from({ length: 4 }, () => pick([...CODE_ALPHABET])).join("");
    if (!usedCodes.has(c)) {
      usedCodes.add(c);
      return c;
    }
  }
};

const KINDS = [
  { kind: "regular", n: 9, everyDays: [2.5, 4], joinedAgo: [70, 92] },
  { kind: "occasional", n: 12, everyDays: [9, 20], joinedAgo: [30, 88] },
  { kind: "onetimer", n: 13, everyDays: [999, 999], joinedAgo: [2, 60] },
];

const ledger = [];
const people = [];
let n = 0;

/** Every phone that already exists, so a generated one never lands on a real account. */
const taken = new Set(
  (await sql.query("select phone from accounts")).rows.map((r) => r.phone),
);

for (const { kind, n: count, everyDays, joinedAgo } of KINDS) {
  for (let i = 0; i < count; i++) {
    const name = NAMES[n % NAMES.length];
    /*
      A free number on a real prefix. `taken` is every phone already in accounts,
      loaded once up front: if a generated number belongs to somebody, it is
      skipped rather than reused, so the demo can never quietly attach a card to
      a real person's account.
    */
    let phone = "";
    do {
      phone = `+216${pick(PREFIXES)}${String(Math.floor(between(100000, 999999)))}`;
    } while (taken.has(phone));
    taken.add(phone);
    n++;
    const joined = now - between(joinedAgo[0], joinedAgo[1]) * DAY;

    people.push({ phone, name, joined, kind });

    // the welcome bonus is dated to the day they joined, not today
    ledger.push([phone, WELCOME, "welcome", new Date(joined), null]);

    if (kind === "onetimer") {
      // most never come back; a couple bought once and vanished
      if (rnd() < 0.45) {
        const amt = Math.round(between(3, 9) * 2) / 2;
        ledger.push([phone, Math.floor(amt * RATE), "earn", new Date(joined + between(0, 2) * DAY), amt]);
      }
      continue;
    }

    let t = joined + between(0, 3) * DAY;
    while (t < now - DAY) {
      // a coffee is 3–8 TND; a table with friends or a brunch is more, rarely
      const amt = rnd() < 0.14
        ? Math.round(between(14, 34))
        : Math.round(between(3, 9) * 2) / 2;
      ledger.push([phone, Math.floor(amt * RATE), "earn", new Date(t), amt]);
      t += between(everyDays[0], everyDays[1]) * DAY;
    }
  }
}

/* ── write the ledger ─────────────────────────────────────────────────── */
/* The showcase customer is the busiest regular — the most interesting card to
   open, because it has history, a balance and a reward waiting. */
const showcase = people.filter((x) => x.kind === "regular")[0];

for (const p of people) {
  const isShowcase = p.phone === showcase.phone;
  await sql.query(
    `insert into accounts (phone, pin_hash, name, code, created_at)
     values ($1,$2,$3,$4,$5) on conflict (phone) do nothing`,
    [
      p.phone,
      // everyone but the showcase gets a well-formed hash of a PIN nobody holds
      isShowcase ? await hashPin(SHOWCASE_PIN) : `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`,
      p.name,
      mintCode(),
      new Date(p.joined),
    ],
  );
  await sql.query(
    `insert into diner_cafes (phone, business_id, first_played_at)
     values ($1,$2,$3) on conflict do nothing`,
    [p.phone, biz, new Date(p.joined)],
  );
}

for (const [phone, delta, reason, at, amount] of ledger) {
  await sql.query(
    `insert into points_ledger (business_id, customer_phone, delta, reason, amount_tnd, created_at)
     values ($1,$2,$3,$4,$5,$6)`,
    [biz, phone, delta, reason, amount, at],
  );
}

/* ── redemptions ──────────────────────────────────────────────────────── */
/*
  Real shops have both: rewards collected weeks ago, and one or two codes sitting
  on a phone right now waiting to be shown. The pending ones are what make the
  counter's "Valider une récompense" tab demonstrable.
*/
const balance = (phone) =>
  ledger.filter((l) => l[0] === phone).reduce((s, l) => s + l[1], 0);

const spenders = people
  .filter((p) => p.kind !== "onetimer")
  .sort((a, b) => balance(b.phone) - balance(a.phone));

let claimed = 0;
let pending = 0;
for (const p of spenders) {
  let left = balance(p.phone);
  const affordable = rewardIds.filter((r) => r.cost <= left);
  if (!affordable.length) continue;

  const r = pick(affordable);
  const isPending = pending < 2 && claimed >= 6;
  const at = isPending ? new Date(now - between(1, 20) * 3600_000) : new Date(now - between(3, 60) * DAY);

  await sql.query(
    `insert into points_ledger (business_id, customer_phone, delta, reason, created_at)
     values ($1,$2,$3,'redeem',$4)`,
    [biz, p.phone, -r.cost, at],
  );
  await sql.query(
    `insert into loyalty_redemptions (business_id, phone, reward_id, code, status, expires_at, created_at)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      biz,
      p.phone,
      r.id,
      Array.from({ length: 6 }, () => pick([...CODE_ALPHABET])).join(""),
      isPending ? "pending" : "claimed",
      new Date(at.getTime() + 48 * 3600_000),
      at,
    ],
  );
  left -= r.cost;
  if (isPending) pending++;
  else claimed++;
  if (claimed >= 8 && pending >= 2) break;
}

/* ── what the owner will actually see ─────────────────────────────────── */
const { rows: stat } = await sql.query(
  `select
     (select count(*) from diner_cafes where business_id=$1)                                  as cards,
     (select count(distinct customer_phone) from points_ledger where business_id=$1 and reason='earn') as buyers,
     (select count(*) from points_ledger where business_id=$1 and reason='earn')              as visits,
     (select coalesce(sum(amount_tnd),0) from points_ledger where business_id=$1 and reason='earn') as tnd,
     (select coalesce(sum(delta),0) from points_ledger where business_id=$1)                  as points_out,
     (select count(*) from loyalty_redemptions where business_id=$1 and status='claimed')      as claimed,
     (select count(*) from loyalty_redemptions where business_id=$1 and status='pending')      as pending`,
  [biz],
);
const s = stat[0];

const repeat = (
  await sql.query(
    `select count(*) from (
       select customer_phone from points_ledger
        where business_id=$1 and reason='earn'
        group by customer_phone having count(*) > 1) x`,
    [biz],
  )
).rows[0].count;

console.log(`
${NAME} — provisioned

  shop            /${SLUG}   (opened ${opened.toISOString().slice(0, 10)}, plan pro)
  owner sign-in   ${OWNER_EMAIL} / ${OWNER_PASSWORD}
  customer view   /moi → ${showcase.phone.replace("+216", "")} / ${SHOWCASE_PIN}   (${showcase.name})

  cards           ${s.cards}
  who bought      ${s.buyers}   (${repeat} came back more than once)
  visits          ${s.visits} over 90 days
  through Pointili ${Number(s.tnd).toFixed(1)} TND
  points balance  ${s.points_out} outstanding
  rewards         ${s.claimed} collected, ${s.pending} waiting at the counter

  remove it       node scripts/demo.mjs --drop
`);

await sql.end();
