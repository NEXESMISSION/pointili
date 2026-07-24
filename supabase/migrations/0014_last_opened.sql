-- Track when a diner last opened each of their cards, so the wallet can sort by
-- "recently opened" — the order a diner actually thinks in.
alter table diner_cafes add column if not exists last_opened_at timestamptz;

-- Seed it from first_played_at so existing cards have a sensible order.
update diner_cafes set last_opened_at = first_played_at where last_opened_at is null;

-- diner_wallet now carries last_opened_at (for the sort) alongside everything else.
create or replace function diner_wallet(p_phone text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(card order by card->>'name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'businessId',   b.id,
      'name',         b.name,
      'slug',         b.slug,
      'businessType', b.business_type,
      'primaryColor', b.primary_color,
      'logoUrl',      b.logo_url,
      'lastOpenedAt', (select dc.last_opened_at from diner_cafes dc
                        where dc.business_id = b.id and dc.phone = p_phone),
      'balance',      pointili_balance(b.id, p_phone),
      'stamps',       (select coalesce(count, 0) from loyalty_stamps s
                        where s.business_id = b.id and s.phone = p_phone),
      'pendingWins',  (select count(*) from wins w
                        where w.business_id = b.id and w.phone = p_phone and w.status = 'pending'),
      'pendingRewards', (
                        (select count(*) from loyalty_redemptions r
                          where r.business_id = b.id and r.phone = p_phone and r.status = 'pending')
                      + (select count(*) from stamp_rewards sr
                          where sr.business_id = b.id and sr.phone = p_phone and sr.status = 'pending'))
    ) as card
    from businesses b
    where b.id in (
      select business_id from points_ledger where customer_phone = p_phone
      union
      select business_id from diner_cafes where phone = p_phone
    )
  ) cards;
$$;

do $$
begin
  execute 'revoke all on function diner_wallet(text) from public, anon, authenticated';
  execute 'grant execute on function diner_wallet(text) to service_role';
end $$;
