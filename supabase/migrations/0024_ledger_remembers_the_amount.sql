-- ===========================================================================
-- The ledger remembers what was actually typed.
--
-- points_ledger recorded only `delta` — the points. credit_points took
-- p_amount_tnd, used it once to compute those points, and threw it away. So
-- after the transaction, the number the cashier actually keyed no longer
-- existed anywhere.
--
-- Two things went wrong because of that, and both are on the record:
--
--   1. A customer asks "what if he types the wrong amount — would I ever know?"
--      Nobody could answer, because the correction row and the original row are
--      both just deltas. Now a mistyped 600 is visibly 600 DINARS, not 600
--      points, in the row the correction is meant to explain.
--
--   2. Revenue on Analyses is reconstructed as earnedPoints / points_per_tnd,
--      against the CURRENT rate (lib/stats.ts). Change the rate in Réglages and
--      every past month silently rewrites itself. Storing the dinars means the
--      history stops depending on a setting the owner is free to edit.
--
-- Nullable and backfill-free ON PURPOSE. Rows written before today genuinely do
-- not know their amount, and inventing one by dividing by today's rate would
-- bake in exactly the error this column exists to remove. NULL here means "not
-- recorded", and reporting must keep the old derivation as the fallback until
-- the pre-column rows age out.
-- ===========================================================================

alter table points_ledger
  add column if not exists amount_tnd numeric(10,3);

comment on column points_ledger.amount_tnd is
  'Dinars the cashier keyed for an ''earn'' row. NULL for welcome/redeem/adjust, and for any earn row written before 0024.';

-- ---------------------------------------------------------------------------
-- credit_points: same signature, same return, now writes the amount.
-- ---------------------------------------------------------------------------
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
  if not cafe_is_live(p_business_id) then
    return jsonb_build_object('ok', false, 'reason', 'café indisponible');
  end if;

  select * into v_prog from loyalty_programs where business_id = p_business_id;
  if not found or not v_prog.active then
    return jsonb_build_object('ok', false, 'reason', 'programme de fidélité inactif');
  end if;

  -- one-time welcome bonus per (café, phone). No amount: nobody paid for it.
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
    insert into points_ledger(business_id, customer_phone, delta, reason, amount_tnd)
    values (p_business_id, p_phone, v_earn, 'earn', p_amount_tnd);
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

revoke all on function credit_points(uuid, text, numeric) from public, anon, authenticated;
grant execute on function credit_points(uuid, text, numeric) to service_role;
