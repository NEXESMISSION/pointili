-- Point the resolvers at the account code.
--
-- card_by_code keeps its signature and its business_id argument so every caller
-- compiles unchanged, but it now tries the ACCOUNT code first and falls back to
-- the old per-shop code. That fallback is the whole point: every code a customer
-- has already written down, or that is sitting on a printed card, keeps working
-- at the shop it came from. Nothing is stranded, and reverting the app code
-- alone is enough to roll this back.
--
-- diner_cafes.code is deliberately left in place. Dropping it in the same
-- migration that repoints the readers would leave a revert with nothing to read.

create or replace function card_by_code(p_business_id uuid, p_code text)
returns jsonb
language sql stable security definer set search_path = public as $$
  with q as (
    select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) as c
  )
  select payload from (
    -- 1 · the account code: works at every shop, including one they have never
    --     visited (the till credits them; the points wait).
    select 1 as src,
           jsonb_build_object('phone', a.phone, 'name', a.name, 'code', a.code) as payload
    from accounts a, q
    where length(q.c) = 4 and a.code = q.c

    union all

    -- 2 · the legacy per-shop code, so already-printed codes keep working here.
    select 2,
           jsonb_build_object('phone', dc.phone, 'name', a2.name, 'code', a2.code)
    from diner_cafes dc
    join q on dc.code = q.c
    left join accounts a2 on a2.phone = dc.phone
    where dc.business_id = p_business_id and length(q.c) = 4
  ) r
  order by src            -- required: a bare union all guarantees no ordering
  limit 1;
$$;

-- owner_cards shows the ACCOUNT code, and searches it.
--
-- Cross-shop isolation survives untouched: the `people` CTE is already scoped to
-- this business, so searching a global code can only ever surface someone this
-- shop has actually served. A walk-in still has no account and therefore still
-- shows "—", and `enrolled` still means "holds a card HERE" — that is the
-- per-shop relationship and it stays per-shop.
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
      a.code,                        -- null until they have an account → "—"
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
       or coalesce(a.code, '') ilike '%' || upper(regexp_replace(p_search, '[^A-Za-z0-9]', '', 'g')) || '%'
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
declare fn text; fns text[] := array[
  'card_by_code(uuid, text)',
  'owner_cards(uuid, text, integer, integer)'
];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
