-- ===========================================================================
-- 1,5 dinar earns 1,5 points. 1,25 earns 1,25.
--
-- 0026 tried to solve the flooring by banking the leftover fraction and paying
-- it out on the next visit. It was arithmetically exact and it was the wrong
-- answer: the customer still could not check it. They spend 1,25 DT, they see
-- "+1 point", and the missing quarter lives in a table they will never see and
-- nobody at the counter can explain. A loyalty programme has exactly one job —
-- be believed — and "trust me, you'll get it next time" is not that.
--
-- So points become decimal, which is what the arithmetic was all along.
-- floor() and the carry both go. delta is numeric(12,2): a hundredth of a point
-- is finer than any till will ever key, and it is EXACT — numeric, never float,
-- because 0,1 + 0,2 has to equal 0,3 in a balance a customer is adding up in
-- their head.
--
-- Reward prices stay whole numbers by convention (nobody prices an espresso at
-- 27,5 points) but nothing here forces that; the column already accepts what
-- an owner types.
-- ===========================================================================

alter table points_ledger
  alter column delta type numeric(12, 2) using delta::numeric(12, 2);

/*
  Dropped, not replaced: CREATE OR REPLACE cannot change a return type, and this
  one goes from integer to numeric.

  CASCADE is safe here and takes nothing with it: a plpgsql body — or a SQL body
  written as a quoted string, which is all of them in this schema — resolves the
  functions it calls at RUN time, so Postgres records no catalog dependency. The
  dozen RPCs that call pointili_balance survive the drop untouched and pick up
  the new signature on their next call. (Verified with scripts/verify-db.mjs
  after applying: every RPC still present, still revoked from anon.)
*/
drop function if exists pointili_balance(uuid, text) cascade;

create or replace function pointili_balance(p_business_id uuid, p_phone text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::numeric(12, 2)
  from points_ledger
  where business_id = p_business_id and customer_phone = p_phone;
$$;

create or replace function credit_points(
  p_business_id uuid,
  p_phone       text,
  p_amount_tnd  numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_prog    loyalty_programs%rowtype;
  v_mult    numeric;
  v_earn    numeric;
  v_welcome integer := 0;
begin
  -- serialise writes for this (café, phone): two tills crediting the same
  -- customer at once must not both decide "no welcome bonus yet".
  perform pg_advisory_xact_lock(hashtext(p_business_id::text || ':' || p_phone));

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

  /*
    round(_, 2), not floor. The rounding is at the HUNDREDTH — two decimals of
    a point, on an amount the cashier keyed to at most two decimals of a dinar —
    so it is only ever protecting against numeric dust, never taking a cut.
  */
  v_earn := round(p_amount_tnd * v_prog.points_per_tnd * v_mult, 2);

  if v_earn > 0 then
    insert into points_ledger(business_id, customer_phone, delta, reason, amount_tnd)
    values (p_business_id, p_phone, v_earn, 'earn', p_amount_tnd);
  end if;

  return jsonb_build_object(
    'ok', true,
    'earned', v_earn,
    'welcome', v_welcome,
    'balance', pointili_balance(p_business_id, p_phone),
    'multiplier', v_mult
  );
end;
$$;

/*
  The bank is gone, and so is the reason for it. Any remainder still sitting in
  here is under one point and is written off in the customer's favour: with
  decimals every future sale pays in full, so there is nothing left to carry.
*/
drop function if exists points_preview_inputs(uuid, text);
drop table if exists points_carry;

/** Only the multiplier is left to tell the till about. */
create or replace function points_preview_inputs(p_business_id uuid, p_phone text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'multiplier', pointili_active_multiplier(p_business_id, 'points'),
    'carry', 0
  );
$$;

/* A correction can move a fraction too — otherwise undoing a 1,25 DT sale
   could not give back the 1,25 points it granted. */
create or replace function owner_adjust_points(
  p_business_id uuid,
  p_phone       text,
  p_delta       numeric,
  p_amount_tnd  numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not cafe_is_live(p_business_id) then
    return jsonb_build_object('ok', false, 'reason', 'café indisponible');
  end if;

  if coalesce(p_delta, 0) <> 0 then
    insert into points_ledger(business_id, customer_phone, delta, reason, amount_tnd)
    values (p_business_id, p_phone, round(p_delta, 2), 'adjust', p_amount_tnd);
  end if;

  return jsonb_build_object('ok', true, 'balance', pointili_balance(p_business_id, p_phone));
end;
$$;

-- the integer-delta form would otherwise sit alongside as an ambiguous overload
drop function if exists owner_adjust_points(uuid, text, integer, numeric);
drop function if exists owner_adjust_points(uuid, text, integer);

revoke all on function pointili_balance(uuid, text) from public, anon, authenticated;
grant execute on function pointili_balance(uuid, text) to service_role;
revoke all on function credit_points(uuid, text, numeric) from public, anon, authenticated;
grant execute on function credit_points(uuid, text, numeric) to service_role;
revoke all on function points_preview_inputs(uuid, text) from public, anon, authenticated;
grant execute on function points_preview_inputs(uuid, text) to service_role;
revoke all on function owner_adjust_points(uuid, text, numeric, numeric) from public, anon, authenticated;
grant execute on function owner_adjust_points(uuid, text, numeric, numeric) to service_role;

-- ===========================================================================
-- And back to one point per dinar for a new shop.
--
-- 0026 raised the default to 10 to escape the flooring — a 2,5 DT coffee had
-- to earn a whole number of points, so the points had to be big enough that
-- whole numbers were fine-grained. Decimals remove that constraint entirely,
-- and "un dinar = un point" is the sentence an owner can say to a customer
-- without either of them doing arithmetic.
--
-- The seeded rewards move with it, priced in visits rather than in round
-- numbers: at a ~2,5 DT café that is roughly 6, 14, 24 and 60 visits, with the
-- welcome bonus already covering the first two.
-- ===========================================================================

alter table loyalty_programs alter column points_per_tnd set default 1;

create or replace function create_cafe(
  p_owner_id uuid,
  p_name     text,
  p_slug     text,
  p_color    text default '#5b3fd1'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' then
    return jsonb_build_object('ok', false, 'reason', 'slug_invalid');
  end if;
  -- keep in step with RESERVED_SLUGS in lib/data.ts AND slug_available() below
  if p_slug in ('owner','admin','api','auth','cartes','moi','login','signup','logout','app','static',
                '_next','favicon.ico','icon.png','apple-icon.png','robots.txt','sitemap.xml') then
    return jsonb_build_object('ok', false, 'reason', 'slug_reserved');
  end if;
  if exists (select 1 from businesses where slug = p_slug) then
    return jsonb_build_object('ok', false, 'reason', 'slug_taken');
  end if;

  -- A real trial: 14 days, then the café goes dark until a plan is granted.
  insert into businesses (owner_id, name, slug, status, primary_color, plan, plan_expires_at)
  values (p_owner_id, p_name, p_slug, 'active', p_color, 'trial', now() + interval '14 days')
  returning id into v_id;

  insert into loyalty_programs (business_id, active, points_per_tnd, welcome_points, redeem_expiry_hours)
  values (v_id, true, 1, 10, 48);

  -- Priced in VISITS, not round numbers: at 1 pt/DT and a ~2,5 DT café that is
  -- roughly 6, 14, 24 and 60 visits, with the welcome bonus covering the first
  -- two. The old ladder started at 40 points — sixteen visits for an espresso,
  -- which nobody was ever going to reach.
  insert into loyalty_rewards (business_id, label, points_cost, active, position) values
    (v_id, 'Espresso offert',    25,  true, 0),
    (v_id, 'Cappuccino offert',  45,  true, 1),
    (v_id, 'Pâtisserie du jour', 70,  true, 2),
    (v_id, 'Brunch complet',    160,  true, 3);

  return jsonb_build_object('ok', true, 'id', v_id, 'slug', p_slug);
end;
$$;

revoke all on function create_cafe(uuid, text, text, text) from public, anon, authenticated;
grant execute on function create_cafe(uuid, text, text, text) to service_role;
