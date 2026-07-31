-- ===========================================================================
-- Every sale gave the customer less than it should have.
--
-- credit_points has always done floor(amount × rate × multiplier). At the
-- default rate of 1 point per dinar that means a 2,5 DT coffee — the single
-- most common transaction in a Tunisian café — grants 2 points and the half
-- dinar is deleted. Not rounded, not banked: gone. Real rows from the demo
-- shop: 2,5 → 2, 8,5 → 8, 5,5 → 5, 4,5 → 4. Across its 280 visits that is
-- 61 TND of spend, 2,6%, that the customer paid for and never saw, and the
-- comment in lib/stats.ts had already noticed the money not adding up without
-- anyone connecting it to the customer's side of the counter.
--
-- The loss is worst exactly where loyalty matters most: the smaller the ticket,
-- the bigger the share thrown away. A 2,5 DT coffee loses 20% of its earn. A
-- 200 DT restaurant bill loses 0,25%.
--
-- Points stay INTEGERS — they are printed on a card and counted out loud at a
-- counter, and "vous avez 24,5 points" is not a thing anyone says. So the
-- fraction is kept instead: whatever is under a whole point is banked per
-- (café, customer) and added to their next visit. Five 2,5 DT coffees now earn
-- 2+3+2+3+2 = 12 points instead of 10, and after ten of them the customer has
-- exactly the 25 points the arithmetic owes them.
--
-- This is a different fix from rounding. round() would hand out points the shop
-- never sold on a 2,6 DT sale and still delete 0,4 on a 2,4 DT one; it makes
-- the error smaller and keeps it in both directions. Carrying makes the error
-- zero over any sequence of visits, which is the only version an owner can
-- defend at the counter when a customer does the sum themselves.
-- ===========================================================================

create table if not exists points_carry (
  business_id    uuid    not null references businesses(id) on delete cascade,
  customer_phone text    not null,
  /*
    Always in [0, 1). Under a whole point of value, owed to the customer, held
    until their next credit turns it into a real point. numeric, not float:
    0,1 + 0,2 must be 0,3 here or the bank drifts.
  */
  remainder      numeric(12, 6) not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (business_id, customer_phone)
);

alter table points_carry enable row level security;
-- No policies: the only reader is credit_points, which is security definer.
-- (The service role bypasses RLS; anon and authenticated get nothing.)

create or replace function credit_points(
  p_business_id uuid,
  p_phone       text,
  p_amount_tnd  numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_prog    loyalty_programs%rowtype;
  v_mult    numeric;
  v_exact   numeric;
  v_carry   numeric := 0;
  v_earn    integer;
  v_welcome integer := 0;
begin
  -- serialise writes for this (café, phone): two tills crediting the same
  -- customer at once must not both decide "no welcome bonus yet" — and must not
  -- both read the same remainder and spend it twice.
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

  select remainder into v_carry
    from points_carry
   where business_id = p_business_id and customer_phone = p_phone;

  v_exact := p_amount_tnd * v_prog.points_per_tnd * v_mult + coalesce(v_carry, 0);
  v_earn  := floor(v_exact)::integer;

  /*
    What is left is under one point by construction, so the bank can never grow
    into free points, and it is stored even when v_earn is 0 — a customer buying
    a 0,5 DT coffee four times at 1 pt/DT gets their 2nd point on the fourth
    visit rather than never.
  */
  insert into points_carry (business_id, customer_phone, remainder, updated_at)
  values (p_business_id, p_phone, v_exact - v_earn, now())
  on conflict (business_id, customer_phone)
  do update set remainder = excluded.remainder, updated_at = now();

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
  What the till needs to promise the same number the server will grant.

  The keypad used to preview amount × rate and nothing else, so it ignored an
  active "points doublés" event AND the customer's banked fraction — it could be
  wrong in both directions at once. This hands the caisse the two figures it was
  missing, per customer, at the moment they are identified.
*/
create or replace function points_preview_inputs(p_business_id uuid, p_phone text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'multiplier', pointili_active_multiplier(p_business_id, 'points'),
    'carry', coalesce(
      (select remainder from points_carry
        where business_id = p_business_id and customer_phone = p_phone), 0)
  );
$$;

revoke all on function credit_points(uuid, text, numeric) from public, anon, authenticated;
grant execute on function credit_points(uuid, text, numeric) to service_role;
revoke all on function points_preview_inputs(uuid, text) from public, anon, authenticated;
grant execute on function points_preview_inputs(uuid, text) to service_role;

-- ===========================================================================
-- And a rate a shop can actually run.
--
-- The default was 1 point per dinar, and create_cafe seeded rewards at 40/80/
-- 120/300 points. A new café therefore opened handing out 2 points for a coffee
-- against a 40-point reward: twenty visits for the cheapest thing on the list,
-- and eighty for the espresso once the owner priced one at 200. Nothing in the
-- product ever said so — the rate lives in one editor and the reward prices in
-- another, and the two numbers never met on screen.
--
-- 10 pt/DT makes the arithmetic legible instead: a 2,5 DT coffee is 25 points,
-- the first reward at 250 is ten coffees, and the welcome bonus is worth a
-- visit and a half rather than a rounding error. Bigger numbers also simply
-- feel better to the person collecting them.
--
-- EXISTING cafés keep whatever they set — a column default and a seed only
-- touch shops created from here on. Nobody's customers get repriced overnight.
-- ===========================================================================


-- (superseded by 0027, which sets the default back to 1 pt/DT.)


revoke all on function create_cafe(uuid, text, text, text) from public, anon, authenticated;
grant execute on function create_cafe(uuid, text, text, text) to service_role;
