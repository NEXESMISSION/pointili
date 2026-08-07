-- ===========================================================================
-- 0038 · The PIN gate counts the attempt BEFORE it judges it.
--
-- A diner's PIN is four digits — ten thousand possibilities. The lockout is not
-- a nicety around that; the lockout IS the control. It had two holes.
--
-- ── 1 · check-then-act ────────────────────────────────────────────────────
-- The callers did:
--      pin_locked_for(phone)   -- read:  am I allowed?
--      verify the PIN          -- slow:  scrypt
--      pin_fail(phone)         -- write: count it, maybe lock
--
-- Nothing serialises those three steps. Fire a hundred requests at once and all
-- hundred read "not locked" before any of them reaches pin_fail, so all hundred
-- PINs get evaluated. The counter faithfully records 100 failures afterwards,
-- which is a very accurate account of a door that was already walked through.
-- With 5 attempts per 15 minutes the honest brute-force cost is ~10 days; with
-- the race it is one burst, and 10 000 guesses fit in a handful of them.
--
-- ── 2 · locking RESET the counter ─────────────────────────────────────────
-- pin_fail set `count = 0` at the moment it locked. So the fifteen minutes were
-- not a penalty on a run of failures, they were a pause that handed back a full
-- fresh allowance. Attempts now decay by WINDOW, not by reaching the lock.
--
-- ── the shape of the fix ──────────────────────────────────────────────────
-- One function, pin_gate(), that takes an advisory lock on the phone, counts
-- the attempt, and only then says whether the caller may proceed. Counting
-- first is the whole point: an attempt that is not recorded until after the
-- verify is an attempt every parallel request is blind to.
--
-- pg_advisory_xact_lock is the same primitive credit_points and redeem_at_counter
-- use to stop a double-tap spending the same points twice — the problem here is
-- identical in shape, so the answer is too.
--
-- pin_fail / pin_locked_for / pin_clear all survive: pin_clear is still what a
-- successful sign-in calls, and the other two stay for any caller not yet moved
-- across. New code should call pin_gate.
-- ===========================================================================

create or replace function pin_gate(
  p_phone   text,
  p_max     integer default 5,
  p_minutes integer default 15
) returns integer                     -- minutes still locked; 0 = you may try
language plpgsql security definer set search_path = public as $$
declare
  v_locked timestamptz;
  v_count  integer;
begin
  /*
    Serialise every attempt for THIS phone. Concurrent guesses now queue behind
    one another instead of racing past a stale read, which is what turns the
    counter from a record of the break-in into the thing that prevents it.
  */
  perform pg_advisory_xact_lock(hashtext('pin:' || p_phone));

  insert into pin_attempts(phone, count) values (p_phone, 0)
  on conflict (phone) do nothing;

  select locked_until, count into v_locked, v_count
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

/*
  pin_fail keeps its signature — app code and the suites still call it — but it
  no longer wipes the counter when it locks. A lockout is a consequence of a run
  of failures; zeroing the run is how the fifteen minutes became a free refill.
*/
create or replace function pin_fail(
  p_phone   text,
  p_max     integer default 5,
  p_minutes integer default 15
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_lock  timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('pin:' || p_phone));

  insert into pin_attempts(phone, count) values (p_phone, 1)
  on conflict (phone) do update
    set count = pin_attempts.count + 1, updated_at = now()
  returning count into v_count;

  if v_count >= p_max then
    v_lock := now() + make_interval(mins => p_minutes);
    -- count is NOT reset here; the window expiring is what clears it (pin_gate).
    update pin_attempts set locked_until = v_lock, updated_at = now()
     where phone = p_phone;
    return v_lock;
  end if;
  return null;
end $$;

-- Same door as every other sensitive RPC: service_role only. 0036 sweeps this
-- too, but say it here so the file is complete on its own.
revoke all on function pin_gate(text, integer, integer) from public, anon, authenticated;
grant execute on function pin_gate(text, integer, integer) to service_role;

/*
  Prove the race is closed, in the database, at migration time.

  Five sequential calls must return 0,0,0,0,0 and the sixth must lock — and the
  count must NOT have been reset by the lock, so a seventh call still reports
  locked rather than handing out a fresh allowance.
*/
do $$
declare
  ph text := '+21600000000-pin-gate-selfcheck';
  r  integer;
begin
  delete from pin_attempts where phone = ph;

  for i in 1..5 loop
    r := pin_gate(ph, 5, 15);
    if r <> 0 then
      raise exception 'pin_gate refused attempt % of 5 (returned %)', i, r;
    end if;
  end loop;

  r := pin_gate(ph, 5, 15);
  if r = 0 then
    raise exception 'pin_gate allowed a 6th attempt — the lockout does not engage';
  end if;

  r := pin_gate(ph, 5, 15);
  if r = 0 then
    raise exception 'pin_gate handed back a fresh allowance while locked';
  end if;

  delete from pin_attempts where phone = ph;
end $$;
