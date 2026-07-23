-- Pointili — server-authoritative RPCs (build spec §06)
-- The ONLY way value changes. The client requests; the server decides & writes
-- atomically. Execute is revoked from anon/authenticated → callable only by the
-- service role inside trusted Next.js API routes.

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------
create or replace function pointili_balance(p_business_id uuid, p_phone text)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::integer
  from points_ledger
  where business_id = p_business_id and customer_phone = p_phone;
$$;

create or replace function pointili_active_multiplier(p_business_id uuid, p_kind text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(max(multiplier), 1)
  from cafe_events
  where business_id = p_business_id
    and kind = p_kind
    and now() between starts_at and ends_at;
$$;

-- 6-char code, no ambiguous chars (0/O/1/I)
create or replace function pointili_gen_code()
returns text language sql volatile as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32 + 1)::int, 1),
    ''
  )
  from generate_series(1, 6);
$$;

-- ===========================================================================
-- 1 · Consume → Earn.  Staff credits a phone at the caisse.
--
-- Returns jsonb so the caisse can show the "+12" moment and the welcome bonus
-- separately (§10 · moment 1) without a second round-trip.
-- ===========================================================================
drop function if exists credit_points(uuid, text, numeric);
create or replace function credit_points(
  p_business_id uuid,
  p_phone       text,
  p_amount_tnd  numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_prog    loyalty_programs%rowtype;
  v_mult    numeric;
  v_earn    integer;
  v_welcome integer := 0;
begin
  -- serialise writes for this (café, phone): two tills crediting the same
  -- customer at once must not both decide "no welcome bonus yet".
  perform pg_advisory_xact_lock(hashtext(p_business_id::text || ':' || p_phone));

  -- The café must be live: suspended or lapsed subscription = no new points.
  -- (cafe_is_live is created in 0007; plpgsql resolves calls at run time, so
  -- defining this first is fine.)
  if not cafe_is_live(p_business_id) then
    return jsonb_build_object('ok', false, 'reason', 'café indisponible');
  end if;

  select * into v_prog from loyalty_programs where business_id = p_business_id;
  if not found or not v_prog.active then
    return jsonb_build_object('ok', false, 'reason', 'programme de fidélité inactif');
  end if;

  -- one-time welcome bonus per (café, phone)
  if v_prog.welcome_points > 0 and not exists (
    select 1 from points_ledger
    where business_id = p_business_id and customer_phone = p_phone and reason = 'welcome'
  ) then
    v_welcome := v_prog.welcome_points;
    insert into points_ledger(business_id, customer_phone, delta, reason)
    values (p_business_id, p_phone, v_welcome, 'welcome');
  end if;

  v_mult := pointili_active_multiplier(p_business_id, 'points');
  v_earn := floor(p_amount_tnd * v_prog.points_per_tnd * v_mult)::integer;

  if v_earn > 0 then
    insert into points_ledger(business_id, customer_phone, delta, reason)
    values (p_business_id, p_phone, v_earn, 'earn');
  end if;

  return jsonb_build_object(
    'ok', true,
    'earned', v_earn,
    'welcome', v_welcome,
    'multiplier', v_mult,
    'balance', pointili_balance(p_business_id, p_phone)
  );
end;
$$;

-- ===========================================================================
-- 2 · The Spin.  Server picks the prize, enforces cooldown, everyone-wins.
-- ===========================================================================
create or replace function play_game(
  p_slug   text,
  p_phone  text,
  p_device text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_game        games%rowtype;
  v_cooldown    integer;
  v_last        timestamptz;
  v_expiry_hrs  integer;
  v_total       numeric := 0;
  v_pick        numeric;
  v_running     numeric := 0;
  v_chosen      prizes%rowtype;
  v_weight      numeric;
  v_code        text;
  r             record;
begin
  -- one spin at a time per diner: without this, two parallel requests could
  -- both pass the cooldown check and mint two prizes.
  perform pg_advisory_xact_lock(hashtext('play:' || p_slug || ':' || p_phone));

  select id into v_business_id from businesses where slug = p_slug;
  if v_business_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  -- Suspended or lapsed → the café is dark, no spins.
  if not cafe_is_live(v_business_id) then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;

  select * into v_game from games
  where business_id = v_business_id and active
  order by (type = 'wheel') desc
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;

  -- Cooldown from the play log. This is an expected outcome, not an error —
  -- return it as data so the caller can show "next spin in 3 h".
  v_cooldown := coalesce((v_game.config->>'cooldownHours')::int, 24);
  select max(created_at) into v_last from plays
  where game_id = v_game.id and phone = p_phone;
  if v_last is not null and v_last + make_interval(hours => v_cooldown) > now() then
    return jsonb_build_object(
      'ok', false,
      'reason', 'cooldown',
      'nextPlayAt', v_last + make_interval(hours => v_cooldown)
    );
  end if;

  -- weighted, everyone-wins pick over active segments
  for r in select * from prizes where game_id = v_game.id and active order by position loop
    v_weight := coalesce((v_game.config->'prizeConfig'->(r.id::text)->>'weight')::numeric, 1);
    v_total := v_total + v_weight;
  end loop;
  if v_total <= 0 then
    raise exception 'game % has no prize segments', v_game.id;
  end if;

  v_pick := random() * v_total;
  for r in select * from prizes where game_id = v_game.id and active order by position loop
    v_weight := coalesce((v_game.config->'prizeConfig'->(r.id::text)->>'weight')::numeric, 1);
    v_running := v_running + v_weight;
    if v_pick < v_running then
      v_chosen := r;
      exit;
    end if;
  end loop;

  -- log the play
  insert into plays(business_id, phone, device, game_id)
  values (v_business_id, p_phone, p_device, v_game.id);

  -- passport
  insert into diner_cafes(phone, business_id)
  values (p_phone, v_business_id)
  on conflict (phone, business_id) do nothing;

  -- write the win code (unless the segment is a "lose"/consolation with no code)
  v_code := null;
  if coalesce((v_game.config->'prizeConfig'->(v_chosen.id::text)->>'isLose')::boolean, false) = false then
    select coalesce(redeem_expiry_hours, 48) into v_expiry_hrs
    from loyalty_programs where business_id = v_business_id;
    loop
      v_code := pointili_gen_code();
      exit when not exists (
        select 1 from wins where business_id = v_business_id and code = v_code
        union all
        select 1 from loyalty_redemptions where business_id = v_business_id and code = v_code
      );
    end loop;
    insert into wins(business_id, phone, prize_id, code, status, expires_at)
    values (v_business_id, p_phone, v_chosen.id, v_code, 'pending',
            now() + make_interval(hours => coalesce(v_expiry_hrs, 48)));
  end if;

  return jsonb_build_object(
    'ok',         true,
    'prizeId',    v_chosen.id,
    'prizeIndex', v_chosen.position,
    'prizeLabel', v_chosen.label,
    'isLose',     coalesce((v_game.config->'prizeConfig'->(v_chosen.id::text)->>'isLose')::boolean, false),
    'code',       v_code,
    'nextPlayAt', now() + make_interval(hours => v_cooldown)
  );
end;
$$;

-- ===========================================================================
-- 3 · The Reward.  Atomic spend at the counter.
-- ===========================================================================
drop function if exists redeem_at_counter(uuid, text, uuid);
create or replace function redeem_at_counter(
  p_business_id uuid,
  p_phone       text,
  p_reward_id   uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_reward loyalty_rewards%rowtype;
  v_bal    integer;
  v_hrs    integer;
  v_code   text;
begin
  -- serialise concurrent redemptions for the same (café, phone) — this is what
  -- stops a double-tap on "Échanger" from spending the same points twice.
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

  -- retry on the astronomically unlikely code collision
  loop
    v_code := pointili_gen_code();
    exit when not exists (
      select 1 from loyalty_redemptions where business_id = p_business_id and code = v_code
      union all
      select 1 from wins where business_id = p_business_id and code = v_code
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

-- ===========================================================================
-- 4 · The Return.  Consecutive-day streak + XP.
-- ===========================================================================
create or replace function touch_diner_streak(
  p_phone text,
  p_xp    integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v diner_streaks%rowtype;
  v_today date := current_date;
begin
  select * into v from diner_streaks where phone = p_phone;

  if not found then
    insert into diner_streaks(phone, current, longest, xp, play_count, last_play_day)
    values (p_phone, 1, 1, greatest(p_xp, 0), 1, v_today)
    returning * into v;
  elsif v.last_play_day = v_today then
    update diner_streaks
      set xp = xp + greatest(p_xp, 0), play_count = play_count + 1, updated_at = now()
      where phone = p_phone returning * into v;
  else
    update diner_streaks set
      current = case
        when v.last_play_day = v_today - 1 then v.current + 1
        when v.freezes > 0 and v.last_play_day = v_today - 2 then v.current + 1
        else 1
      end,
      freezes = case
        when v.last_play_day = v_today - 2 and v.freezes > 0 then v.freezes - 1
        else v.freezes
      end,
      xp = xp + greatest(p_xp, 0),
      play_count = play_count + 1,
      last_play_day = v_today,
      updated_at = now()
    where phone = p_phone returning * into v;
    update diner_streaks set longest = greatest(longest, current) where phone = p_phone returning * into v;
  end if;

  return jsonb_build_object(
    'current', v.current, 'longest', v.longest, 'xp', v.xp, 'freezes', v.freezes
  );
end;
$$;

-- ===========================================================================
-- 5 · Diner wallet — every café where this phone has activity.
-- ===========================================================================
create or replace function diner_wallet(p_phone text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(card order by card->>'name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'businessId',   b.id,
      'name',         b.name,
      'slug',         b.slug,
      'primaryColor', b.primary_color,
      'logoUrl',      b.logo_url,
      'balance',      pointili_balance(b.id, p_phone),
      'pendingWins',  (select count(*) from wins w
                        where w.business_id = b.id and w.phone = p_phone and w.status = 'pending'),
      'pendingRewards', (select count(*) from loyalty_redemptions r
                        where r.business_id = b.id and r.phone = p_phone and r.status = 'pending')
    ) as card
    from businesses b
    where b.id in (
      select business_id from points_ledger where customer_phone = p_phone
      union
      select business_id from diner_cafes where phone = p_phone
    )
  ) cards;
$$;

-- ---------------------------------------------------------------------------
-- Lock these down: server-authoritative only.
--
-- CRITICAL, and easy to get wrong: Postgres grants EXECUTE on new functions to
-- PUBLIC by default, and every role — including `anon` and `authenticated` — is
-- a member of PUBLIC. Revoking from anon/authenticated alone leaves the PUBLIC
-- grant intact, so the functions stay callable by anyone holding the anon key…
-- which ships in the browser. Combined with `security definer`, that means a
-- diner could open devtools and call credit_points() for a million points.
--
-- So: revoke from PUBLIC (which covers every role), then grant back to
-- service_role only — the key that never leaves the server.
-- Verify with scripts/verify-db.mjs; it fails loudly if anon regains execute.
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
  fns text[] := array[
    'credit_points(uuid, text, numeric)',
    'play_game(text, text, text)',
    'redeem_at_counter(uuid, text, uuid)',
    'touch_diner_streak(text, integer)',
    'diner_wallet(text)',
    'pointili_balance(uuid, text)',
    'pointili_active_multiplier(uuid, text)',
    'pointili_gen_code()'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
