-- ===========================================================================
-- THE HISTORY DISAGREED WITH THE BALANCE, ON EVERY FRACTIONAL EARNING.
--
-- 0034 built this function with `l.delta::int`. That was true of the schema it
-- was written against — and it stopped being true in 0027, which altered
-- points_ledger.delta to numeric(12,2) so that "a point is a dinar" could
-- survive a 3,30 DT coffee. 0027 is the OLDER migration; 0034 simply carried a
-- cast that had already been invalidated, and nothing failed loudly because
-- ::int is perfectly legal on a numeric.
--
-- What the customer saw: the card said 3,3 points and the history said 3, for
-- the same purchase, on two screens one tap apart. Postgres rounds numeric->int
-- half away from zero, so a 12,5 delta printed as 13 — the history could read
-- HIGHER than what was actually credited. Summed over a month of coffees the
-- history's own total drifted from the balance by several points in either
-- direction, which is the one thing a loyalty card cannot do: a balance nobody
-- can reconcile is a balance nobody trusts.
--
-- The other three branches of the union carried a bare `0`, which types as
-- integer and would have forced the whole column back to integer by union
-- resolution however the first branch was cast. They are 0::numeric now. The
-- literal is still zero because a collected reward is a row in the history with
-- no points movement of its own — the points left when it was BOUGHT.
--
-- Nothing else changes: same shape, same ordering, same limit, same four
-- sources. Only the units.
-- ===========================================================================

create or replace function diner_history(p_business_id uuid, p_phone text, p_limit int default 8)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'delta', e.delta, 'reason', e.reason, 'label', e.label,
      'amount', e.amount, 'at', e.at
    )
    order by e.at desc
  ), '[]'::jsonb)
  from (
    select l.delta::numeric as delta, l.reason::text as reason, null::text as label,
           l.amount_tnd::numeric as amount, l.created_at as at
    from points_ledger l
    where l.business_id = p_business_id and l.customer_phone = p_phone
    union all
    select 0::numeric, 'collected', p.label, null::numeric, coalesce(w.claimed_at, w.created_at)
    from wins w join prizes p on p.id = w.prize_id
    where w.business_id = p_business_id and w.phone = p_phone and w.status = 'claimed'
    union all
    select 0::numeric, 'collected', lr.label, null::numeric, coalesce(r.claimed_at, r.created_at)
    from loyalty_redemptions r join loyalty_rewards lr on lr.id = r.reward_id
    where r.business_id = p_business_id and r.phone = p_phone and r.status = 'claimed'
    union all
    select 0::numeric, 'collected', sr.label, null::numeric, coalesce(sr.claimed_at, sr.created_at)
    from stamp_rewards sr
    where sr.business_id = p_business_id and sr.phone = p_phone and sr.status = 'claimed'
    order by at desc
    limit p_limit
  ) e;
$$;

-- PUBLIC, not just anon+authenticated: a revoke that omits PUBLIC is a no-op,
-- because both roles inherit EXECUTE from it. 0036 exists because of that.
revoke all on function diner_history(uuid, text, int) from public, anon, authenticated;

-- Prove the cast actually changed, against the catalogue rather than against a
-- comment: the first branch of that union must no longer be an integer.
do $$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'diner_history'
  limit 1;

  if v_src is null then
    raise exception 'diner_history is missing after its own migration';
  end if;
  if v_src like '%l.delta::int%' then
    raise exception 'diner_history still casts the ledger delta to int — the history will keep disagreeing with the balance';
  end if;
  if v_src not like '%l.delta::numeric%' then
    raise exception 'diner_history no longer selects l.delta::numeric';
  end if;
end $$;
