-- ===========================================================================
-- 0034 · A LINE OF HISTORY SAYS WHAT YOU SPENT
--
-- The customer's history is nine rows reading "Achat · +12", "Achat · +8",
-- "Achat · +15" — the same word nine times, and a points figure that means
-- nothing on its own. Nobody remembers a purchase by how many points it earned.
-- They remember it by what they paid.
--
-- points_ledger has carried amount_tnd since 0024 ("the ledger remembers the
-- amount"), added so Analyses could net out a reversal. diner_history simply
-- never returned it, so the one screen where a customer asks "what was that?"
-- could not answer.
--
-- Returned as `amount`, null for everything that is not a purchase: a welcome
-- bonus and a correction have no ticket, and showing "0 TND" against them would
-- be worse than showing nothing.
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
    select l.delta::int as delta, l.reason::text as reason, null::text as label,
           l.amount_tnd::numeric as amount, l.created_at as at
    from points_ledger l
    where l.business_id = p_business_id and l.customer_phone = p_phone
    union all
    select 0, 'collected', p.label, null::numeric, coalesce(w.claimed_at, w.created_at)
    from wins w join prizes p on p.id = w.prize_id
    where w.business_id = p_business_id and w.phone = p_phone and w.status = 'claimed'
    union all
    select 0, 'collected', lr.label, null::numeric, coalesce(r.claimed_at, r.created_at)
    from loyalty_redemptions r join loyalty_rewards lr on lr.id = r.reward_id
    where r.business_id = p_business_id and r.phone = p_phone and r.status = 'claimed'
    union all
    select 0, 'collected', sr.label, null::numeric, coalesce(sr.claimed_at, sr.created_at)
    from stamp_rewards sr
    where sr.business_id = p_business_id and sr.phone = p_phone and sr.status = 'claimed'
    order by at desc
    limit p_limit
  ) e;
$$;

revoke all on function diner_history(uuid, text, integer) from public, anon, authenticated;
grant execute on function diner_history(uuid, text, integer) to service_role;
