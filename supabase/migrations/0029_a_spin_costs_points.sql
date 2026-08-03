-- ===========================================================================
-- 0029 · A spin costs points.
--
-- The wheel has been in this database since 0001 and out of the product since
-- ba50250. It comes back changed. The old play_game() was a FREE spin gated by
-- a 24-hour cooldown, drawn on per-prize weights the owner never saw. The wheel
-- the shop actually asked for is the opposite on every axis:
--
--   · the customer PAYS POINTS to spin        (was: free, once a day)
--   · the owner sets that price               (was: no price existed)
--   · the owner turns it on and off           (games.active — already there)
--   · the owner fills the prizes              (prizes — already there)
--   · the draw is FULLY RANDOM                (was: weighted by prizeConfig)
--
-- That is not an edit to play_game, it is a different function. Its argument
-- list changes too (business + phone, no slug, no device), and CREATE OR
-- REPLACE cannot change an argument list — so an "edit" would be a drop and a
-- create anyway. It is dropped here explicitly, because leaving it behind means
-- the database still holds a callable function that mints a prize for free.
--
-- ── the one line that matters most ────────────────────────────────────────
-- spin_wheel takes the SAME advisory lock key as credit_points (0027:59) and
-- redeem_at_counter (0003:237): hashtext(business_id || ':' || phone).
-- play_game took a different one ('play:' || slug || ':' || phone), which meant
-- a spin did not serialise against the points balance at all. Two taps could
-- have spent the same points twice. The shared key is what makes spending
-- points on a spin as safe as spending them on a reward.
-- ===========================================================================

-- ── 1 · the price lives on the row, not in jsonb ──────────────────────────
-- A jsonb key takes no constraint and no type. loyalty_rewards.points_cost is
-- `integer not null check (>= 0)` (0001:64); the spin price is the same kind of
-- thing and is shown next to those on the same screen, so it is the same shape.
alter table games add column if not exists spin_cost integer not null default 10;
do $$ begin
  alter table games add constraint games_spin_cost_check check (spin_cost >= 0);
exception when duplicate_object then null; end $$;

-- ── 2 · the ledger learns the word ────────────────────────────────────────
-- Every point ever moved is one row here. A spin is a debit like any other and
-- must be legible in the history as its own reason, not disguised as a redeem.
alter table points_ledger drop constraint if exists points_ledger_reason_check;
alter table points_ledger add constraint points_ledger_reason_check
  check (reason in ('earn','redeem','welcome','adjust','expire','spin'));

-- ── 3 · a real over-spend, fixed in passing ───────────────────────────────
-- Not the wheel's bug, but it is in the function the wheel is modelled on and
-- it is live. redeem_at_counter declared `v_bal integer` (0003:231) while
-- pointili_balance() has returned numeric since 0027:36. Assigning 24,60 to an
-- integer ROUNDS IT UP to 25 — so `if v_bal < 25` is false and a diner who is
-- forty centimes short walks out with the reward. Only the declaration changes.
create or replace function redeem_at_counter(
  p_business_id uuid,
  p_phone       text,
  p_reward_id   uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_reward loyalty_rewards%rowtype;
  v_bal    numeric;   -- was integer; 24,6 rounded to 25 and bought a 25-pt reward
  v_hrs    integer;
  v_code   text;
begin
  perform pg_advisory_xact_lock(hashtext(p_business_id::text || ':' || p_phone));

  if not cafe_is_live(p_business_id) then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;

  select * into v_reward from loyalty_rewards
  where id = p_reward_id and business_id = p_business_id and active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;

  -- The cost is read from the catalogue here; the client only ever sends an id.
  v_bal := pointili_balance(p_business_id, p_phone);
  if v_bal < v_reward.points_cost then
    return jsonb_build_object(
      'ok', false, 'reason', 'insufficient',
      'balance', v_bal, 'needed', v_reward.points_cost - v_bal
    );
  end if;

  insert into points_ledger(business_id, customer_phone, delta, reason)
  values (p_business_id, p_phone, -v_reward.points_cost, 'redeem');

  select coalesce(redeem_expiry_hours, 48) into v_hrs
  from loyalty_programs where business_id = p_business_id;

  loop
    v_code := pointili_gen_code();
    exit when not exists (
      select 1 from loyalty_redemptions where business_id = p_business_id and code = v_code
      union all
      select 1 from wins where business_id = p_business_id and code = v_code
      union all
      select 1 from stamp_rewards where business_id = p_business_id and code = v_code
    );
  end loop;

  insert into loyalty_redemptions(business_id, phone, reward_id, code, status, expires_at)
  values (p_business_id, p_phone, p_reward_id, v_code, 'pending',
          now() + make_interval(hours => coalesce(v_hrs, 48)));

  return jsonb_build_object(
    'ok', true,
    'code', v_code,
    'label', v_reward.label,
    'balance', pointili_balance(p_business_id, p_phone)
  );
end;
$$;

-- ── 4 · the free spin is gone ─────────────────────────────────────────────
-- migrate.mjs replays the folder in sorted order, so 0003 recreates play_game
-- and this removes it again on every run. The end state is stable.
drop function if exists play_game(text, text, text);

-- ── 5 · the paid spin ─────────────────────────────────────────────────────
create or replace function spin_wheel(
  p_business_id uuid,
  p_phone       text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_game   games%rowtype;
  v_prog   loyalty_programs%rowtype;
  v_bal    numeric;
  v_chosen prizes%rowtype;
  v_hrs    integer;
  v_code   text;
begin
  -- THE shared key. See the header. Never change this to something wheel-specific.
  perform pg_advisory_xact_lock(hashtext(p_business_id::text || ':' || p_phone));

  if not cafe_is_live(p_business_id) then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;

  -- A paused loyalty programme pauses the wheel too. redeem_at_counter leaves
  -- this test to TypeScript (LOGIC-AUDIT L5); doing it here means it holds even
  -- if some future caller forgets.
  select * into v_prog from loyalty_programs where business_id = p_business_id;
  if not found or not v_prog.active then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;

  -- games.active IS the owner's on/off switch. It already carries its own RLS
  -- policy and owner grant, so the toggle needed no new plumbing.
  select * into v_game from games
  where business_id = p_business_id and active
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'off');
  end if;

  -- A wheel with nothing on it is off, whatever the flag says.
  if not exists (select 1 from prizes where game_id = v_game.id and active) then
    return jsonb_build_object('ok', false, 'reason', 'off');
  end if;

  -- Price from the row, never from the caller. The client sends no amount at all.
  v_bal := pointili_balance(p_business_id, p_phone);
  if v_bal < v_game.spin_cost then
    return jsonb_build_object(
      'ok', false, 'reason', 'insufficient',
      'balance', v_bal, 'needed', v_game.spin_cost - v_bal
    );
  end if;

  if v_game.spin_cost > 0 then
    insert into points_ledger(business_id, customer_phone, delta, reason)
    values (p_business_id, p_phone, -v_game.spin_cost, 'spin');
  end if;

  -- FULLY RANDOM, as asked: every active segment is equally likely. The old
  -- config.prizeConfig weights are deliberately not read. The column keeps its
  -- other keys, so nothing is destroyed — the odds simply stop being secret,
  -- because with one prize in N the odds ARE the prize list.
  select * into v_chosen from prizes
  where game_id = v_game.id and active
  order by random()
  limit 1;

  -- The audit trail of what the customer paid for.
  insert into plays(business_id, phone, game_id)
  values (p_business_id, p_phone, v_game.id);

  -- enroll_diner handles the short-code default and the per-business unique
  -- index that play_game's bare insert got wrong (LOGIC-AUDIT L11).
  perform enroll_diner(p_business_id, p_phone);

  v_hrs := coalesce(v_prog.redeem_expiry_hours, 48);

  -- Three-way collision check: a spin must not mint a code that already exists
  -- as a reward or a stamp reward. play_game only checked two of the three.
  loop
    v_code := pointili_gen_code();
    exit when not exists (
      select 1 from wins                where business_id = p_business_id and code = v_code
      union all
      select 1 from loyalty_redemptions where business_id = p_business_id and code = v_code
      union all
      select 1 from stamp_rewards       where business_id = p_business_id and code = v_code
    );
  end loop;

  insert into wins(business_id, phone, prize_id, code, status, expires_at)
  values (p_business_id, p_phone, v_chosen.id, v_code, 'pending',
          now() + make_interval(hours => v_hrs));

  -- The new balance rides back so the store page can update without a round trip.
  return jsonb_build_object(
    'ok',         true,
    'prizeId',    v_chosen.id,
    'prizeIndex', v_chosen.position,
    'prizeLabel', v_chosen.label,
    'code',       v_code,
    'cost',       v_game.spin_cost,
    'balance',    pointili_balance(p_business_id, p_phone)
  );
end;
$$;

-- ── 6 · every shop gets a wheel row, switched off ─────────────────────────
-- create_cafe stopped seeding games in 0027, so every café opened since has no
-- row at all — and an owner cannot toggle a row that does not exist. Backfill
-- is safe precisely because games.active defaults to false: this gives every
-- shop the switch, and turns nothing on.
insert into games (business_id)
select b.id from businesses b
where not exists (select 1 from games g where g.business_id = b.id);

-- ── 7 · the door ──────────────────────────────────────────────────────────
-- Postgres grants EXECUTE to PUBLIC by default, so revoking from anon alone
-- would do nothing. Same DO-block shape as 0003:377-395.
do $$
declare
  fn text;
  fns text[] := array[
    'spin_wheel(uuid, text)',
    'redeem_at_counter(uuid, text, uuid)'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
