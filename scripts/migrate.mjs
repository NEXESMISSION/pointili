import { connect } from "./db.mjs";
import { readFileSync, readdirSync } from "node:fs";

const c = await connect();
const reset = process.argv.includes("--reset");

if (reset) {
  /*
    --reset is `drop schema public cascade`. It is unrecoverable, and it has
    already eaten a real café that someone had created through the UI: it was
    run to "test the migration chain" without a thought for what was living in
    there. Make that impossible to do by accident.
  */
  const { rows } = await c
    .query(`select name, slug from businesses order by created_at`)
    .catch(() => ({ rows: [] }));

  if (rows.length && !process.argv.includes("--i-know")) {
    console.error(`\nREFUSING TO RESET — ${rows.length} café(s) live in this database:`);
    for (const r of rows) console.error(`  · ${r.name} (/${r.slug})`);
    console.error("\nThis DESTROYS them. Back up first:");
    console.error("  node scripts/backup.mjs");
    console.error("Then, if you really mean it:");
    console.error("  node scripts/migrate.mjs --reset --i-know\n");
    await c.end();
    process.exit(1);
  }

  console.log("dropping public schema…");
  // drops every table, function, type and policy in one shot
  await c.query(`drop schema public cascade; create schema public;`);
  await c.query(`
    grant usage on schema public to anon, authenticated, service_role;
    grant all on schema public to postgres;
    alter default privileges in schema public grant all on tables to postgres, service_role;
    alter default privileges in schema public grant all on sequences to postgres, service_role;
  `);
  console.log("public schema reset");
}

for (const f of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
  process.stdout.write(`applying ${f} … `);
  try {
    await c.query(readFileSync(`supabase/migrations/${f}`, "utf8"));
    console.log("ok");
  } catch (e) {
    console.log("FAILED");
    console.error(`  ${e.message}`);
    await c.end();
    process.exit(1);
  }
}
await c.end();
console.log("migrations applied");
