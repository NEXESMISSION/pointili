/**
 * Delete identities the test suites left behind in the REAL database.
 *
 *   node scripts/sweep-test-data.mjs          # list what would go
 *   node scripts/sweep-test-data.mjs --apply  # actually delete
 *
 * The suites run against production (there is no separate test project), and
 * each one deletes its own account at the end — but a suite that throws
 * mid-run never reaches that line. Several did during development, so live,
 * sign-in-able accounts with hard-coded passwords accumulated: the console
 * counted nine of them as "owners", and a leaked café even showed up in the
 * café table.
 *
 * Only these generated shapes are ever touched. Every crash-residue pattern is
 * anchored and ends in @example.com, which RFC 2606 reserves precisely so it can
 * never be a real mailbox.
 *
 * The showcase café (scripts/demo.mjs) is the exception, and it is handled the
 * opposite way. It is deliberately named like a real shop, because its whole job
 * is to be shown to one — so it cannot be recognised by shape. It is matched by
 * its exact address and slug instead, and skipped unless --with-demo is passed.
 */
import { createClient } from "@supabase/supabase-js";
import { connect, env } from "./db.mjs";

const APPLY = process.argv.includes("--apply");
/*
  The showcase café (scripts/demo.mjs) is the one shape here that is NOT crash
  residue — it is provisioned on purpose, and someone may be about to demo it.
  So it is reported like everything else and skipped unless asked for by name.

  `--apply` cleans up after the suites. `--apply --with-demo` also removes the
  demo. Deleting a deliberate fixture as a side effect of tidying would be the
  kind of surprise this script exists to prevent.
*/
const WITH_DEMO = process.argv.includes("--with-demo");

const PATTERNS = [
  /^plain\d+@example\.com$/,
  /^attacker-\d+@example\.com$/,
  /^operator-\d+@example\.com$/,
  /^e2e-owner-\d+@example\.com$/,
  /^probe-\d+@example\.com$/,
  /*
    Residue from driving owner signup by hand, which no script owns.

    Two of these sat in the café table for a fortnight and this sweep could not
    see either one, because every pattern above was written from a suite's
    source — and the signup flow is the one path that gets exercised through the
    browser instead. The shape is still generated (a timestamp in the address, a
    timestamp in the slug), so it is still safely recognisable; nobody had
    written it down.
  */
  /^onboarding-\d+@example\.com$/,
];
const SLUGS = /^(probe-\d+|susp-\d+|attack-\d+|boulangerie-essai-\d+|e2etest|e2e-second-shop|cafe-de-letoile-co)$/;

/** The deliberate fixture, opt-in only. */
const DEMO_EMAIL = /^elmanar@pointili\.online$/;
const DEMO_SLUG = /^cafe-el-manar$/;
const doomedEmail = (e) => PATTERNS.some((p) => p.test(e)) || (WITH_DEMO && DEMO_EMAIL.test(e));
const doomedSlug = (sl) => SLUGS.test(sl) || (WITH_DEMO && DEMO_SLUG.test(sl));

const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = await connect();

/* ── accounts ───────────────────────────────────────────────────────── */
const users = [];
for (let page = 1; page <= 20; page++) {
  const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  users.push(...data.users);
  if (data.users.length < 200) break;
}
const doomed = users.filter((u) => u.email && doomedEmail(u.email));

/* ── cafés ──────────────────────────────────────────────────────────── */
const { rows: cafes } = await sql.query(`select id, slug, name from businesses order by created_at`);
const doomedCafes = cafes.filter((c) => doomedSlug(c.slug));

console.log(`accounts to remove : ${doomed.length}`);
for (const u of doomed) console.log(`   ${u.email}`);
console.log(`cafés to remove    : ${doomedCafes.length}`);
for (const c of doomedCafes) console.log(`   /${c.slug}  (${c.name})`);

const { rows: [keep] } = await sql.query(
  `select count(*) n from profiles p
    where not (p.email ~ '^(plain|attacker-|operator-|e2e-owner-|probe-)[0-9]*@example\\.com$')`,
);
console.log(`\nreal accounts that stay: ${keep.n}`);

if (!APPLY) {
  console.log("\n(dry run — pass --apply to delete)");
  await sql.end();
  process.exit(0);
}

for (const c of doomedCafes) await sql.query(`delete from businesses where id=$1`, [c.id]);
for (const u of doomed) {
  const { error } = await svc.auth.admin.deleteUser(u.id);
  if (error) console.log(`   could not delete ${u.email}: ${error.message}`);
}
// the profiles row is created by a trigger and does not always cascade
await sql.query(
  `delete from profiles
    where email ~ '^(plain|attacker-|operator-|e2e-owner-|probe-)[0-9]*@example\\.com$'`,
);

const { rows: [left] } = await sql.query(`select count(*) n from profiles`);
console.log(`\nswept. profiles remaining: ${left.n}`);
await sql.end();
