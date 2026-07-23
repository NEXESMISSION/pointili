/**
 * Security gate for the live database. Exits non-zero on any violation.
 *   node scripts/verify-db.mjs
 *
 * Guards the two invariants the whole product rests on:
 *   1. RLS is ON for every table (no cross-café reads).
 *   2. The value-changing RPCs are NOT executable by anon/authenticated.
 *      The anon key ships in the browser and these are `security definer` — if
 *      anon can call credit_points(), anyone can mint themselves points.
 *      This regressed once already: Postgres grants EXECUTE to PUBLIC by
 *      default, so revoking from anon/authenticated alone does nothing.
 */
import { connect } from "./db.mjs";

const c = await connect();
const problems = [];

// ── 1. RLS on every table ───────────────────────────────────────────
const tables = await c.query(`
  select c.relname as table, c.relrowsecurity as rls,
         (select count(*) from pg_policies p where p.tablename = c.relname)::int as policies
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname`);

console.log("=== TABLES · RLS · POLICIES ===");
for (const r of tables.rows) {
  console.log(`  ${r.rls ? "rls" : "OFF"}  ${String(r.policies).padStart(2)} pol  ${r.table}`);
  if (!r.rls) problems.push(`RLS is OFF on ${r.table}`);
}

// ── 2. RPC execute grants ───────────────────────────────────────────
const grants = await c.query(`
  select p.proname,
         has_function_privilege('anon', p.oid, 'execute') as anon,
         has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
         has_function_privilege('service_role', p.oid, 'execute') as service_role
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('credit_points','play_game','redeem_at_counter',
                      'touch_diner_streak','diner_wallet','pointili_balance')
  order by p.proname`);

console.log("\n=== RPC EXECUTE (anon/authenticated MUST be false) ===");
console.table(grants.rows);
for (const g of grants.rows) {
  if (g.anon) {
    problems.push(`anon can EXECUTE ${g.proname} — callable with the browser key`);
  }
  if (g.authenticated) problems.push(`authenticated can EXECUTE ${g.proname}`);
  if (!g.service_role) {
    problems.push(`service_role CANNOT execute ${g.proname} — the app will break`);
  }
}

await c.end();

if (problems.length) {
  console.error("\nFAILED:");
  for (const p of problems) console.error("  x " + p);
  process.exit(1);
}
console.log("\nsecurity checks passed");
