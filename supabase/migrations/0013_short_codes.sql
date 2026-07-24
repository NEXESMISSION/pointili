-- A short, simple customer code — 4 characters, easy to read aloud or type.
--
-- It replaces the 10-char global public_id at the counter. A globally-unique
-- 4-char code can't scale (~1M combos), so the code is PER-SHOP: unique within a
-- business, which scales fine because a shop has far fewer customers than the
-- whole platform. The cashier is already scoped to their shop (ownerCafe), so a
-- per-shop code resolves unambiguously.

-- 4-char code from an unambiguous alphabet (no 0/O/1/I).
create or replace function pointili_gen_short()
returns text language sql volatile as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32 + 1)::int, 1),
    ''
  )
  from generate_series(1, 4);
$$;

alter table diner_cafes add column if not exists code text;

-- Backfill existing cards with a per-business-unique code.
do $$
declare r record; v text;
begin
  for r in select business_id, phone from diner_cafes where code is null loop
    loop
      v := pointili_gen_short();
      exit when not exists (select 1 from diner_cafes where business_id = r.business_id and code = v);
    end loop;
    update diner_cafes set code = v where business_id = r.business_id and phone = r.phone;
  end loop;
end $$;

alter table diner_cafes alter column code set default pointili_gen_short();
alter table diner_cafes alter column code set not null;
create unique index if not exists diner_cafes_code_uidx on diner_cafes(business_id, code);

-- Enroll (idempotent) AND assign the per-shop code, retrying on the rare
-- collision. Returns the code — this replaces the plain upsert in lib/db.
create or replace function enroll_diner(p_business_id uuid, p_phone text)
returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  select code into v_code from diner_cafes
  where business_id = p_business_id and phone = p_phone;
  if found then return v_code; end if;

  loop
    v_code := pointili_gen_short();
    begin
      insert into diner_cafes(phone, business_id, code) values (p_phone, p_business_id, v_code);
      return v_code;
    exception when unique_violation then
      -- either the code collided, or the row was just created concurrently
      select code into v_code from diner_cafes
      where business_id = p_business_id and phone = p_phone;
      if v_code is not null then return v_code; end if;
      -- else: code collision only — loop for a fresh one
    end;
  end loop;
end $$;

-- Resolve a scanned/typed short code (within one shop) → the customer. The phone
-- stays server-side; the caisse gets a name.
create or replace function card_by_code(p_business_id uuid, p_code text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('phone', dc.phone, 'name', a.name)
  from diner_cafes dc
  left join accounts a on a.phone = dc.phone
  where dc.business_id = p_business_id
    and dc.code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
  limit 1;
$$;

-- owner_cards now identifies each card by its short per-shop code.
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
      dc.code,
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
        or dc.code ilike '%' || upper(regexp_replace(p_search, '[^A-Za-z0-9]', '', 'g')) || '%'
      )
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'phone', phone, 'name', name, 'code', code, 'balance', balance,
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

-- Lock down.
do $$
declare fn text; fns text[] := array[
  'enroll_diner(uuid, text)',
  'card_by_code(uuid, text)',
  'owner_cards(uuid, text, integer, integer)'
];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
