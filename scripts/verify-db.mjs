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

/*
  ── 2. RPC execute grants — EVERY security-definer function, not a list ──

  This check used to name six functions. That is why the critical shipped:
  migrations 0028 and 0035 added `admin_traffic`, `admin_decide_renewal`,
  `admin_renewal_proof`, `admin_renewal_requests`, `submit_renewal_request` and
  `my_renewal_requests`, revoked EXECUTE `from anon, authenticated` — which is a
  no-op, because Postgres grants EXECUTE to PUBLIC by default and anon inherits
  from PUBLIC — and this gate said nothing, because none of the six names it
  knew about had changed. The whole admin/billing surface was callable with the
  browser key and the ship gate was green.

  A gate that enumerates what to check can only ever catch what somebody
  remembered to add. This enumerates what EXISTS: every `security definer`
  function in `public`, minus a small allowlist that must stay reachable.

  `public` is checked explicitly and FIRST. Testing only anon would still pass
  while the PUBLIC grant sat underneath it.
*/
const RLS_HELPERS = [
  // Named inside RLS policy USING/WITH CHECK clauses. A policy is evaluated as
  // the QUERYING role, so revoking these from anon breaks every anonymous read
  // — the public café page included. Each takes ids and returns a boolean or a
  // public projection; none moves money or crosses a tenant boundary.
  "pointili_owns_business",
  "pointili_owns_game",
  "pointili_is_super_admin",
  "pointili_business_public",
  "pointili_game_public",
];

const grants = await c.query(
  `select p.proname,
          has_function_privilege('public', p.oid, 'execute') as public,
          has_function_privilege('anon', p.oid, 'execute') as anon,
          has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
          has_function_privilege('service_role', p.oid, 'execute') as service_role
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and not (p.proname = any($1::text[]))
   order by p.proname`,
  [RLS_HELPERS],
);

console.log("\n=== RPC EXECUTE (anon/authenticated MUST be false) ===");
console.table(grants.rows);
for (const g of grants.rows) {
  // PUBLIC first: this is the grant a `revoke ... from anon` never removes.
  if (g.public) {
    problems.push(
      `PUBLIC can EXECUTE ${g.proname} — the revoke omitted the word "public", so it did nothing`,
    );
  }
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
