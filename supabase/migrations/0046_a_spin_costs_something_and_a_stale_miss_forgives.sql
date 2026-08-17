-- ===========================================================================
-- TWO HOLES FOUND BY THE CLIENT-SIDE AUDIT. Both are in the database, so both
-- are closed in the database rather than in a screen that can be bypassed.
--
-- ── 1. A WHEEL PRICED AT ZERO HAD NO LIMIT OF ANY KIND ────────────────────
--
-- spin_wheel prices the spin from the row and never from the caller, which is
-- right. But the price is ALSO the only thing rationing a spin: 0029 removed
-- cooldownHours on purpose, and says so — "a spin is no longer rationed by
-- time, it is bought with points". At spin_cost = 0 that leaves nothing:
--
--     v_bal < v_game.spin_cost   ->  bal < 0, never true, so never refused
--     if v_game.spin_cost > 0    ->  false, so no ledger row is written
--
-- and every other check (live café, active programme, active game, at least one
-- active prize) is a property of the SHOP, not of this customer or this spin.
-- So a shop that set the price to zero — the field accepted it — could be spun
-- in a loop, and each spin mints a real `wins` row with a real code that the
-- counter honours. That is unlimited free stock, drawn from the shop's till.
--
-- The fix is a constraint rather than an edit to spin_wheel: with 0 unreachable
-- the hole closes without rewriting a function that moves money. Existing rows
-- are clamped up, not deleted — a shop that meant "free" now means "1 point",
-- which is the cheapest thing the mechanic can honestly express.
--
-- ── 2. THE PIN COUNTER NEVER FORGAVE A STALE MISS ─────────────────────────
--
-- pin_attempts.count is zeroed in exactly two places: when an expired lockout
-- is cleared, and by pin_clear on a successful sign-in. A customer who mistypes
-- once in January, once in March and three times in June has five, and their
-- next miss — the sixth in half a year — locks them out for fifteen minutes.
-- Nothing about that is a brute-force attempt.
--
-- A window, which is what the counter always meant: misses older than the
-- lockout period stop counting. An actual attacker cannot use this, because
-- filling the keyspace requires attempts far closer together than the window.
-- ===========================================================================

-- ── 1 ──────────────────────────────────────────────────────────────────────
update games set spin_cost = 1 where spin_cost is null or spin_cost < 1;

alter table games drop constraint if exists games_spin_cost_positive;
alter table games add constraint games_spin_cost_positive check (spin_cost >= 1);

-- ── 2 ──────────────────────────────────────────────────────────────────────
create or replace function pin_gate(p_phone text, p_max int default 5, p_minutes int default 15)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_locked timestamptz;
  v_count  int;
  v_seen   timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('pin:' || p_phone));

  insert into pin_attempts(phone, count) values (p_phone, 0)
  on conflict (phone) do nothing;

  select locked_until, count, updated_at into v_locked, v_count, v_seen
  from pin_attempts where phone = p_phone for update;

  -- Still inside a lockout: say how long, and count nothing. Hammering during a
  -- lockout must not extend it — that would let anyone lock a diner out forever.
  if v_locked is not null and v_locked > now() then
    return greatest(1, ceil(extract(epoch from (v_locked - now())) / 60))::integer;
  end if;

  -- The lockout has expired: the slate is clean, once.
  if v_locked is not null then
    update pin_attempts set locked_until = null, count = 0 where phone = p_phone;
    v_count := 0;
  end if;

  -- A WINDOW, NOT A LIFETIME TALLY. Misses older than the lockout period are
  -- forgotten, so five typos spread across months no longer add up to a
  -- lockout. An attacker gains nothing: sweeping a 4-digit keyspace needs
  -- attempts orders of magnitude closer together than this window.
  if v_seen is not null and v_seen < now() - make_interval(mins => p_minutes) then
    v_count := 0;
  end if;

  -- COUNT IT NOW, before the caller has verified anything.
  v_count := coalesce(v_count, 0) + 1;
  update pin_attempts set count = v_count, updated_at = now() where phone = p_phone;

  if v_count > p_max then
    update pin_attempts
       set locked_until = now() + make_interval(mins => p_minutes),
           updated_at = now()
     where phone = p_phone;
    return p_minutes;
  end if;

  return 0;
end $$;

revoke all on function pin_gate(text, int, int) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from games where spin_cost < 1) then
    raise exception 'a game still costs less than one point to spin';
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'games_spin_cost_positive'
  ) then
    raise exception 'the spin-cost constraint did not take';
  end if;
end $$;
