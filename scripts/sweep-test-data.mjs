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
 * Only these generated shapes are ever touched. A real address cannot match:
 * every pattern is anchored and ends in @example.com, which RFC 2606 reserves
 * precisely so it can never be a real mailbox.
 */
import { createClient } from "@supabase/supabase-js";
import { connect, env } from "./db.mjs";

const APPLY = process.argv.includes("--apply");

const PATTERNS = [
  /^plain\d+@example\.com$/,
  /^attacker-\d+@example\.com$/,
  /^operator-\d+@example\.com$/,
  /^e2e-owner-\d+@example\.com$/,
  /^probe-\d+@example\.com$/,
];
const SLUGS = /^(probe-\d+|susp-\d+|attack-\d+|e2etest|e2e-second-shop|cafe-de-letoile-co)$/;

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
const doomed = users.filter((u) => u.email && PATTERNS.some((p) => p.test(u.email)));

/* ── cafés ──────────────────────────────────────────────────────────── */
const { rows: cafes } = await sql.query(`select id, slug, name from businesses order by created_at`);
const doomedCafes = cafes.filter((c) => SLUGS.test(c.slug));

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
