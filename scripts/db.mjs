// Thin psql-ish helper: node scripts/db.mjs "select 1"
import pg from "pg";
import { setDefaultResultOrder } from "node:dns";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/*
  Prefer IPv4 when resolving the database host.

  Supabase's pooler publishes four addresses: two IPv4 and two NAT64 IPv6
  (64:ff9b::/96). Node 18+ returns them in DNS order and will happily try an
  IPv6 one first — which fails with ENETUNREACH on any network without IPv6
  egress, and `pg` surfaces that as a bare AggregateError with no hostname in it.
  The symptom is every fixture-based test suite hanging before its first
  assertion, which reads like a broken test rather than a broken route.
*/
setDefaultResultOrder("ipv4first");

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

/*
  The one-liner CLI — but ONLY when this file is what was run.

  Without the entry check, importing { env } from any script that takes its own
  arguments made this fire and try to execute argv[2] as SQL. A script called
  with an e-mail address died inside the Postgres scanner, nowhere near the
  actual mistake.
*/
const isEntry = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntry && process.argv[2]) {
  const c = await connect();
  const r = await c.query(process.argv[2]);
  console.table(r.rows);
  await c.end();
}
