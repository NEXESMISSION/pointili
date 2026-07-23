// Thin psql-ish helper: node scripts/db.mjs "select 1"
import pg from "pg";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

export async function connect() {
  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}
export { env };

if (process.argv[2]) {
  const c = await connect();
  const r = await c.query(process.argv[2]);
  console.table(r.rows);
  await c.end();
}
