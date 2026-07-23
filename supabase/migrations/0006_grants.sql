-- Pointili — table privileges
--
-- WHY THIS EXISTS
--
-- `drop schema public cascade` (scripts/migrate.mjs --reset) destroys the
-- table-level GRANTs Supabase provisions for `anon` and `authenticated`. Without
-- them the owner's own session can read nothing and write nothing — and an
-- UPDATE that matches zero rows is NOT an error in Postgres, so the app happily
-- reported "Enregistré ✦" while silently changing nothing.
--
-- RLS and GRANTs are two different gates, and BOTH must pass:
--   GRANT  → may this role touch this table at all?
--   RLS    → which rows may it touch?
-- RLS without a grant = silent no-op. A grant without RLS = a data breach.
--
-- So: grant deliberately, per table, and let RLS do the row filtering.

-- ---------------------------------------------------------------------------
-- Public catalogue — anyone may READ an active café's public config.
-- (RLS still restricts to active/paused cafés; see 0002.)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select on
  businesses, loyalty_programs, loyalty_rewards, games, prizes, cafe_events
to anon, authenticated;

/*
  A signed-in user MUST be able to read their own profile row — it is where the
  role lives. Without this grant, currentOwner() reads back null, quietly
  defaults the role to 'owner', and a super-admin is bounced out of /admin with
  no error anywhere. RLS (profiles_self) still limits it to their own row.

  Fails closed, which is why it went unnoticed: a missing grant costs privilege
  rather than granting it. Still wrong.
*/
grant select, update on profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Owners manage their own café. RLS (`*_owner_write`) constrains this to rows
-- they actually own — the grant only says "this table is in play".
-- ---------------------------------------------------------------------------
grant insert, update, delete on
  businesses, loyalty_programs, loyalty_rewards, games, prizes, cafe_events, app_staff
to authenticated;

grant select on app_staff to authenticated;

-- Owner dashboards read their café's ledgers (RLS: owner-read-only).
grant select on points_ledger, loyalty_redemptions, plays, wins to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- NOT granted to anyone but service_role, on purpose:
--   accounts      — holds pin_hash
--   pin_attempts  — the brute-force lockout must not be readable or clearable
--   diner_streaks / diner_cafes — global per-diner data, not café-scoped
-- These have RLS on with zero policies, so even a grant wouldn't expose them —
-- but no grant means no accident either. Defence in depth.
-- ---------------------------------------------------------------------------
revoke all on accounts, pin_attempts, diner_streaks, diner_cafes
  from anon, authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Keep future tables safe by default.
alter default privileges in schema public
  grant all on tables to postgres, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, service_role;
