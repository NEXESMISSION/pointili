/**
 * Remove test diners from the database.
 *   node scripts/purge-test-data.mjs          # dry run — shows what would go
 *   node scripts/purge-test-data.mjs --yes    # actually delete
 *
 * Test runs create real rows in the real database, and those robots then count
 * as customers in the owner's Analyses — inflating retention with traffic that
 * never bought anything. e2e.mjs now cleans up after itself; this clears what
 * earlier runs left behind.
 *
 * Deletes ONLY accounts whose name marks them as a fixture. Anything else is
 * treated as a real customer and left alone.
 */
import { connect } from "./db.mjs";

/**
 * ONLY names no human would choose.
 *
 * This list once included "saif" — the name a screenshot script happened to use.
 * It is also the owner's actual first name, so the purge ate their real test
 * account. A deletion heuristic must never match a plausible human name.
 */
const TEST_NAMES = ["E2E"];
const APPLY = process.argv.includes("--yes");

const c = await connect();

const { rows: victims } = await c.query(
  `select phone, name, created_at from accounts where name = any($1) order by created_at`,
  [TEST_NAMES],
);

if (victims.length === 0) {
  console.log("no test accounts found — nothing to do");
  await c.end();
  process.exit(0);
}

console.log(`${victims.length} test account(s):`);
for (const v of victims) {
  const { rows } = await c.query(
    `select coalesce(sum(delta),0)::int as bal, count(*)::int as n
       from points_ledger where customer_phone = $1`,
    [v.phone],
  );
  console.log(`  ${v.phone.padEnd(16)} "${v.name}"  ${rows[0].n} ledger rows, ${rows[0].bal} pts`);
}

if (!APPLY) {
  console.log("\ndry run — pass --yes to delete");
  await c.end();
  process.exit(0);
}

const phones = victims.map((v) => v.phone);
// children first: several tables reference accounts(phone)
for (const [table, col] of [
  ["loyalty_redemptions", "phone"],
  ["wins", "phone"],
  ["plays", "phone"],
  ["points_ledger", "customer_phone"],
  ["diner_cafes", "phone"],
  ["diner_streaks", "phone"],
  ["pin_attempts", "phone"],
  ["accounts", "phone"],
]) {
  const r = await c.query(`delete from ${table} where ${col} = any($1)`, [phones]);
  if (r.rowCount) console.log(`  deleted ${r.rowCount} from ${table}`);
}

await c.end();
console.log("\npurged");
