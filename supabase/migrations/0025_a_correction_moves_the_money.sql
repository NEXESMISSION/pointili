-- ===========================================================================
-- A correction has to move the money too.
--
-- 0024 taught the ledger to remember the dinars a cashier keyed, and its stated
-- reason was the 600-instead-of-60 typo. The till then grew a one-tap "Annuler"
-- for exactly that mistake — and it only ever gave the POINTS back.
--
-- owner_adjust_points writes reason 'adjust' with no amount, and lib/stats.ts
-- builds every money figure from reason 'earn'. So undoing a mistyped sale
-- restored the customer's balance and left +600 TND of revenue, one extra
-- visite and 600 extra points émis on Analyses, permanently, with no path in the
-- product to correct it. The one screen whose whole job is to be believed could
-- never be reconciled against the till drawer.
--
-- So the correction carries the dinars it is reversing. p_amount_tnd is
-- OPTIONAL and defaults to null, which keeps every existing caller working: a
-- manual "+10 / -5" correction genuinely has no sale attached to it and must
-- stay out of the revenue sum. Only a reversal of a known credit passes it.
--
-- Reporting then nets 'earn' and 'adjust' rather than filtering to 'earn', so a
-- reversal subtracts revenue, a visit and a ticket instead of being invisible.
-- ===========================================================================

create or replace function owner_adjust_points(
  p_business_id uuid,
  p_phone       text,
  p_delta       integer,
  p_amount_tnd  numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not cafe_is_live(p_business_id) then
    return jsonb_build_object('ok', false, 'reason', 'café indisponible');
  end if;

  if coalesce(p_delta, 0) <> 0 then
    insert into points_ledger(business_id, customer_phone, delta, reason, amount_tnd)
    values (p_business_id, p_phone, p_delta, 'adjust', p_amount_tnd);
  end if;

  return jsonb_build_object('ok', true, 'balance', pointili_balance(p_business_id, p_phone));
end;
$$;

/*
  The 3-argument form has to go, or PostgREST sees two candidates and cannot
  choose: `p_amount_tnd` has a default, so the old signature is still callable
  and the overload is ambiguous rather than additive.
*/
drop function if exists owner_adjust_points(uuid, text, integer);

revoke all on function owner_adjust_points(uuid, text, integer, numeric)
  from public, anon, authenticated;
grant execute on function owner_adjust_points(uuid, text, integer, numeric) to service_role;
