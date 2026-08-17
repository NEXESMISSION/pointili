-- ===========================================================================
-- 0036 · A revoke that does not name PUBLIC is not a revoke.
--
-- THE BUG, precisely.
--
-- Postgres grants EXECUTE on every new function to the pseudo-role PUBLIC.
-- Writing
--     revoke all on function admin_traffic(uuid, int) from anon, authenticated;
-- removes grants those two roles never separately held, and leaves the PUBLIC
-- grant untouched. anon INHERITS from PUBLIC, so the function stays callable
-- with the key that ships in the browser. The statement reads like a lock and
-- is a no-op.
--
-- 0003 got this right — it revokes `from public, anon, authenticated`. 0028 and
-- 0035 did not, and that omission exposed the entire admin/renewal surface:
--
--     admin_decide_renewal    approve renewals — mint free 'pro' plans
--     admin_renewal_proof     payment receipts: name, phone, partial account no.
--     admin_renewal_requests  every shop's billing state
--     admin_traffic           platform-wide analytics
--     submit_renewal_request  forge a request against any shop
--     my_renewal_requests     any shop's billing history
--
-- Their only gate was is_super(p_actor) — with p_actor supplied by the CALLER.
-- That is not authorisation, it is a suggestion, and it was defeated outright:
-- `grant select on businesses to anon` has no column list, so businesses.owner_id
-- is world-readable, and a super-admin owns a public shop. Read the uuid off
-- that shop, pass it as p_actor, and the gate opens. Verified live.
--
-- ── THE FIX IS A RULE, NOT A LIST ─────────────────────────────────────────
-- Revoking the six by name would fix today and lose tomorrow: the next
-- security-definer function to land arrives EXECUTE-to-PUBLIC by default and
-- nothing would notice. So this sweeps EVERY security-definer function in
-- `public` and closes it, with a small, explicit, commented allowlist.
--
-- Because migrate.mjs replays the whole folder in sorted order, this file runs
-- AFTER every migration that creates a function — so it also closes anything
-- added later, on every single migration run. That ordering is the mechanism;
-- do not renumber this file below the migrations that define functions.
-- ===========================================================================

do $$
declare
  fn record;
  /*
    The allowlist, and why each entry is on it.

    These are RLS PREDICATE helpers: they are named inside policy USING/WITH
    CHECK clauses, and a policy is evaluated as the QUERYING role. Revoke
    EXECUTE from anon and every anonymous read that depends on one of these
    stops working — the public café page included. They are safe to expose
    because each takes only ids and returns a boolean or a public projection;
    none moves money, and none returns another tenant's rows.
  */
  keep text[] := array[
    'pointili_owns_business',
    'pointili_owns_game',
    'pointili_is_super_admin',
    'pointili_business_public',
    'pointili_game_public'
  ];
  closed int := 0;
begin
  for fn in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef                      -- security definer only
      and not (p.proname = any(keep))
  loop
    -- `public` FIRST and by name. That word is the whole point of this file.
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
    execute format('grant execute on function %s to service_role', fn.sig);
    closed := closed + 1;
  end loop;
  raise notice 'closed EXECUTE-to-PUBLIC on % security-definer function(s)', closed;
end $$;

/*
  Prove it, here, rather than trusting the loop above.

  A migration that silently did nothing would look identical to one that worked.
  This raises if any security-definer function outside the allowlist is still
  reachable by PUBLIC or anon when the migration finishes.
*/
do $$
declare
  leaked text;
  keep text[] := array[
    'pointili_owns_business', 'pointili_owns_game', 'pointili_is_super_admin',
    'pointili_business_public', 'pointili_game_public'
  ];
begin
  select string_agg(p.proname, ', ' order by p.proname) into leaked
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and not (p.proname = any(keep))
    and (has_function_privilege('public', p.oid, 'execute')
      or has_function_privilege('anon',   p.oid, 'execute'));

  if leaked is not null then
    raise exception 'still EXECUTE-able by public/anon after 0036: %', leaked;
  end if;
end $$;

/*
  ── STILL OPEN, DELIBERATELY, AND TRACKED ─────────────────────────────────

  This migration removes the ability to CALL those functions anonymously. It
  does NOT fix the second half of the flaw: the admin RPCs still authorise on a
  caller-supplied p_actor rather than auth.uid(). With EXECUTE closed, only
  service_role reaches them and the app always passes the session's own actor —
  so the hole is contained, not eliminated.

  ── AND "just use auth.uid()" IS NOT THE FIX, WHICH IS WORTH SAYING ───────
  This note used to end "a future migration should change those signatures to
  derive the actor internally". Following that literally takes the console
  down. Every call site reaches these functions through the SERVICE ROLE
  (lib/supabase/admin), and under the service role auth.uid() is NULL — so
  is_super(auth.uid()) is false for every caller, the real operator included.

  Deriving the actor internally first requires moving all of it onto the
  operator's own session client and re-granting EXECUTE to `authenticated`,
  which un-does half of what this file just did and has to be re-tested against
  RLS on every admin path. It is a real piece of work, not a comment change.

  What was actually left is not a hole an attacker can reach — it is a mistake
  WE could make: eleven call sites each resolving the operator and then passing
  their id by hand, where forgetting the first or mistyping the second is
  privilege escalation that reviews as ordinary code. Those two lines are one
  function now (lib/adminRpc.ts): the gate and the actor are the same call, and
  the argument type forbids a p_actor of its own. There is no longer a way to
  call an admin RPC without being checked, or to be checked as somebody else.

  Also unfixed HERE, and both since addressed — noted so this list is not read
  as still-open work:
    · `grant select on businesses to anon` had no column list, publishing
      owner_id, plan, plan_expires_at and suspended_reason to the world.
      owner_id is the uuid that made this exploit trivial. CLOSED BY 0037,
      which revokes the table grant and re-grants only the presentation
      columns a café page actually shows a stranger.
    · There was no rate limit in front of any code or PIN endpoint. The PIN
      side is CLOSED BY 0038 (the gate counts before it judges).

  ── AND ONE THING THIS FILE'S MECHANISM NO LONGER COVERS ─────────────────
  The sweep above works because migrate.mjs replays the folder in sorted order
  and this file used to sort LAST. It does not any more: 0037+ create security-
  definer functions that this file never sees. Every migration after this one
  therefore has to run its own revoke — they all do, and each ends with an
  assertion that proves it. Check that before adding another.
*/
