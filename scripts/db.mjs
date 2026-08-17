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

/*
  Retried, because the first connection is the flakiest thing in the suite.

  The pooler drops or times out a TCP connect often enough that suites fail
  before their first assertion — and a suite that dies at connect() looks exactly
  like a suite that found a bug: a red line and a stack trace. Hours have gone
  into reading those stacks. Three attempts with a backoff turns the common case
  (one dropped connect) into a two-second pause, and leaves a genuinely
  unreachable database still failing, with the attempt count said out loud so a
  real outage is never mistaken for a slow day.
*/
export async function connect(attempts = 3) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    const client = new pg.Client({
      connectionString: env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });
    try {
      await client.connect();
      if (i > 1) console.error(`  (database connected on attempt ${i})`);
      return client;
    } catch (e) {
      last = e;
      // The failed client holds a socket and its own retry timers; without this
      // the process will not exit even once a later attempt succeeds.
      await client.end().catch(() => {});
      if (i < attempts) await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  console.error(`  !! database unreachable after ${attempts} attempts`);
  throw last;
}
export { env };

/*
  Teardown that survives a failure.

  Every suite here cleans up on its last line, which is never reached when an
  assertion throws first — and the suites run against the REAL database. That is
  how nine live, sign-in-able accounts ended up in production. Anything
  registered below runs whichever way the suite ends.
*/
const _teardown = [];
export const onExit = (fn) => _teardown.push(fn);
let _ran = false;
async function _sweep() {
  if (_ran) return;
  _ran = true;
  for (const fn of _teardown.reverse()) {
    /*
      Best effort, but never SILENT.

      This used to be `catch {}`, on the reasoning that a teardown error must not
      mask the assertion that actually failed. True — and it also meant the one
      thing teardown exists to prevent could fail with nobody told. The account
      stays in production either way; the difference is whether anyone knows.
      Printing is not masking: the real error is thrown afterwards, by the caller.
    */
    try { await fn(); } catch (e) { console.error("  ! teardown step failed:", e?.message ?? e); }
  }
}

/**
 * Delete a test account and PROVE it is gone.
 *
 * `admin.auth.admin.deleteUser()` resolves with `{ error }` — it does not throw.
 * So the ordinary `await admin.auth.admin.deleteUser(id)` that every suite ends
 * with is a no-op whenever the call fails, and the failure it fails on is the
 * flaky one: a dropped connection to Supabase. The account that survives is
 * live, sign-in-able, and in the production database.
 *
 * Retries, because the cause is transient, then verifies. If it still cannot be
 * removed it says so by NAME and loudly, because at that point the only
 * remaining cleanup is a human one.
 */
export async function deleteAccount(admin, id, label = id) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (!error) {
      // Verified, not assumed — a 200 with the row still present is the whole
      // failure mode this function exists for.
      const { data } = await admin.auth.admin.getUserById(id);
      if (!data?.user) return true;
    }
    if (attempt < 4) await new Promise((r) => setTimeout(r, 400 * attempt));
  }
  console.error(
    `\n  !! COULD NOT DELETE TEST ACCOUNT ${label} (${id}).\n` +
      "     It is live and sign-in-able in the production database. Remove it by hand.",
  );
  return false;
}
process.on("unhandledRejection", async (e) => {
  console.error("\n--- suite failed, cleaning up ---");
  await _sweep();
  console.error(e);
  process.exit(1);
});
process.on("uncaughtException", async (e) => {
  console.error("\n--- suite crashed, cleaning up ---");
  await _sweep();
  console.error(e);
  process.exit(1);
});


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
