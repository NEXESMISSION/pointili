import { connect } from "./db.mjs";
import { writeFileSync } from "node:fs";

const c = await connect();
const t = await c.query(`
  select table_name from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE' order by table_name`);

const dump = { takenAt: new Date().toISOString(), tables: {}, authUsers: [], functions: [] };
for (const { table_name } of t.rows) {
  const r = await c.query(`select * from public."${table_name}"`);
  dump.tables[table_name] = r.rows;
}
dump.authUsers = (await c.query(`select id, email, created_at, raw_user_meta_data from auth.users`)).rows;
dump.functions = (await c.query(`
  select p.proname, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public'`)).rows;

const file = `backups/pre-reset-${Date.now()}.json`;
writeFileSync(file, JSON.stringify(dump, null, 2));
const rows = Object.values(dump.tables).reduce((s, a) => s + a.length, 0);
console.log(`backed up ${Object.keys(dump.tables).length} tables, ${rows} rows, ${dump.functions.length} functions -> ${file}`);
await c.end();
