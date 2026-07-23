import { connect } from "./db.mjs";
const c = await connect();

const tables = await c.query(`
  select table_name from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE' order by table_name`);

console.log(`\n=== PUBLIC TABLES (${tables.rows.length}) — with live row counts ===`);
let total = 0;
for (const { table_name } of tables.rows) {
  const r = await c.query(`select count(*)::int as n from public."${table_name}"`);
  total += r.rows[0].n;
  console.log(`  ${String(r.rows[0].n).padStart(6)}  ${table_name}`);
}
console.log(`  ${String(total).padStart(6)}  TOTAL ROWS`);

const users = await c.query(`select count(*)::int as n from auth.users`);
console.log(`\n=== auth.users: ${users.rows[0].n}`);
const u = await c.query(`select email, created_at, last_sign_in_at from auth.users order by created_at`);
console.table(u.rows);

console.log("=== FUNCTIONS ===");
const fns = await c.query(`
  select routine_name from information_schema.routines
  where routine_schema='public' order by routine_name`);
console.log(fns.rows.map((r) => r.routine_name).join(", ") || "(none)");

console.log("\n=== STORAGE BUCKETS ===");
const b = await c.query(`select id, public from storage.buckets`).catch(() => ({ rows: [] }));
console.log(b.rows.map((r) => `${r.id}${r.public ? " (public)" : ""}`).join(", ") || "(none)");

await c.end();
