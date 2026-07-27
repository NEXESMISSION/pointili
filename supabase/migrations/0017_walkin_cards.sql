-- Walk-in customers must be visible.
--
-- A cashier can credit a phone that has never signed up — the ledger is keyed by
-- (business_id, phone), so the points simply wait, and the moment that person
-- joins they find them already on their card. That is the intended behaviour.
--
-- The gap: owner_cards listed only rows from diner_cafes, so those phones were
-- INVISIBLE in the client list — their balance could never be searched, checked
-- or corrected, while Analyses counted them. A mistyped digit created a ghost
-- balance nobody could reach.
--
-- Now the list is every phone this business has touched: cards first-class,
-- ledger-only phones included with a null code (the UI already renders "—").

create or replace function owner_cards(
  p_business_id uuid,
  p_search      text default '',
  p_limit       int  default 50,
  p_offset      int  default 0
) returns jsonb
language sql stable security definer set search_path = public as $$
  with people as (
    select phone from diner_cafes where business_id = p_business_id
    union
    select customer_phone from points_ledger where business_id = p_business_id
  ),
  base as (
    select
      p.phone,
      a.name,
      dc.code,                       -- null until they enrol → shown as "—"
      (dc.phone is not null) as enrolled,
      coalesce(
        dc.first_played_at,
        (select min(created_at) from points_ledger l
          where l.business_id = p_business_id and l.customer_phone = p.phone)
      ) as joined_at,
      pointili_balance(p_business_id, p.phone) as balance,
      coalesce(ls.count, 0)  as stamps,
      coalesce(ls.cycles, 0) as cycles,
      (select max(created_at) from points_ledger l
        where l.business_id = p_business_id and l.customer_phone = p.phone) as last_at,
      (select count(*) from loyalty_redemptions r
        where r.business_id = p_business_id and r.phone = p.phone and r.status = 'pending')
      + (select count(*) from wins w
        where w.business_id = p_business_id and w.phone = p.phone and w.status = 'pending')
      + (select count(*) from stamp_rewards sr
        where sr.business_id = p_business_id and sr.phone = p.phone and sr.status = 'pending') as pending
    from people p
    left join diner_cafes    dc on dc.business_id = p_business_id and dc.phone = p.phone
    left join accounts       a  on a.phone = p.phone
    left join loyalty_stamps ls on ls.business_id = p_business_id and ls.phone = p.phone
    where p_search = ''
       or coalesce(a.name, '') ilike '%' || p_search || '%'
       or p.phone ilike '%' || p_search || '%'
       or coalesce(dc.code, '') ilike '%' || upper(regexp_replace(p_search, '[^A-Za-z0-9]', '', 'g')) || '%'
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'phone', phone, 'name', name, 'code', code, 'enrolled', enrolled,
        'balance', balance, 'stamps', stamps, 'cycles', cycles, 'pending', pending,
        'lastAt', last_at, 'joinedAt', joined_at
      ) order by page.last_at desc nulls last)
      from (
        select * from base order by last_at desc nulls last
        limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0))
      ) page
    ), '[]'::jsonb)
  );
$$;

do $$
begin
  execute 'revoke all on function owner_cards(uuid, text, integer, integer) from public, anon, authenticated';
  execute 'grant execute on function owner_cards(uuid, text, integer, integer) to service_role';
end $$;
