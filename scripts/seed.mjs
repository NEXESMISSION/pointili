/**
 * Seed the live database. Idempotent — safe to re-run.
 *   node scripts/seed.mjs
 *
 * Links the existing auth.users to profiles and marks the founders as
 * super_admin. That's ALL it does — no demo café. Real cafés are created by
 * their owners through onboarding (/owner/nouveau); tests provision their own
 * throwaway café (see scripts/fixture.mjs).
 */
import { connect, env } from "./db.mjs";

// Founders' emails come from .env.local (never hard-code credentials in the repo).
const SUPER_ADMINS = (env.SUPER_ADMIN_EMAILS ?? env.SUPER_ADMIN_EMAIL ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const c = await connect();

// ── profiles for every existing auth user ───────────────────────────
const users = await c.query(`select id, email from auth.users order by created_at`);
if (users.rows.length === 0) {
  console.error("no auth users — create one in the Supabase dashboard first");
  process.exit(1);
}
for (const u of users.rows) {
  const role = SUPER_ADMINS.includes(u.email) ? "super_admin" : "owner";
  await c.query(
    `insert into profiles (id, role, email) values ($1, $2, $3)
     on conflict (id) do update set role = excluded.role, email = excluded.email`,
    [u.id, role, u.email],
  );
  console.log(`profile: ${u.email} → ${role}`);
}

await c.end();
console.log("\nseed complete — profiles linked, no demo café");
