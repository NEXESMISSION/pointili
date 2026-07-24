-- Business identity + customer privacy.
--
--  1. businesses.business_type — a real category (café / bakery / salon / …) set
--     by the owner, so a diner can tell their cards apart and we never guess.
--  2. accounts.public_id — an opaque, scannable code that stands in for the phone
--     everywhere at the counter. The cashier scans a QR (or types this id); the
--     phone number itself is never shown to staff and never leaves the server.

-- 1 · Business type ----------------------------------------------------------
alter table businesses add column if not exists business_type text not null default 'other';

-- 2 · Opaque public id -------------------------------------------------------
create or replace function pointili_gen_public_id()
returns text language sql volatile as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32 + 1)::int, 1),
    ''
  )
  from generate_series(1, 10);
$$;

alter table accounts add column if not exists public_id text;
update accounts set public_id = pointili_gen_public_id() where public_id is null;
alter table accounts alter column public_id set default pointili_gen_public_id();
alter table accounts alter column public_id set not null;
create unique index if not exists accounts_public_id_uidx on accounts(public_id);

-- Resolve a scanned/typed public id back to the account. Service-role only, so
-- the phone never crosses to the browser — the caisse sends an id, gets a name.
create or replace function account_by_public_id(p_public_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('phone', a.phone, 'name', a.name, 'publicId', a.public_id)
  from accounts a
  where a.public_id = upper(regexp_replace(coalesce(p_public_id, ''), '[^A-Za-z0-9]', '', 'g'))
  limit 1;
$$;

-- 3 · diner_wallet now carries the business type + stamp progress ------------
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

-- 4 · owner_cards now shows the public id (staff identify by id, not phone) ---
create or replace function owner_cards(
  p_business_id uuid,
  p_search      text default '',
  p_limit       int  default 50,
  p_offset      int  default 0
) returns jsonb
language sql stable security definer set search_path = public as $$
  with base as (
    select
      dc.phone,
      a.name,
      a.public_id,
      dc.first_played_at as joined_at,
      pointili_balance(p_business_id, dc.phone) as balance,
      coalesce(ls.count, 0)  as stamps,
      coalesce(ls.cycles, 0) as cycles,
      (select max(created_at) from points_ledger l
        where l.business_id = p_business_id and l.customer_phone = dc.phone) as last_at,
      (select count(*) from loyalty_redemptions r
        where r.business_id = p_business_id and r.phone = dc.phone and r.status = 'pending')
      + (select count(*) from wins w
        where w.business_id = p_business_id and w.phone = dc.phone and w.status = 'pending')
      + (select count(*) from stamp_rewards sr
        where sr.business_id = p_business_id and sr.phone = dc.phone and sr.status = 'pending') as pending
    from diner_cafes dc
    left join accounts a on a.phone = dc.phone
    left join loyalty_stamps ls on ls.business_id = p_business_id and ls.phone = dc.phone
    where dc.business_id = p_business_id
      and (
        p_search = '' or coalesce(a.name, '') ilike '%' || p_search || '%'
        or dc.phone ilike '%' || p_search || '%'
        or coalesce(a.public_id, '') ilike '%' || upper(regexp_replace(p_search, '[^A-Za-z0-9]', '', 'g')) || '%'
      )
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'phone', phone, 'name', name, 'publicId', public_id, 'balance', balance,
        'stamps', stamps, 'cycles', cycles, 'pending', pending,
        'lastAt', last_at, 'joinedAt', joined_at
      ) order by page.last_at desc nulls last)
      from (
        select * from base order by last_at desc nulls last
        limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0))
      ) page
    ), '[]'::jsonb)
  );
$$;

-- 5 · Lock down (create-or-replace keeps existing grants; new fn needs one) ---
do $$
declare fn text; fns text[] := array[
  'account_by_public_id(text)',
  'diner_wallet(text)',
  'owner_cards(uuid, text, integer, integer)'
];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
