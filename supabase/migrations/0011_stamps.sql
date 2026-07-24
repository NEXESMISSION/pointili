-- Stamp cards ("tampons") — an optional, admin-controlled loyalty mode that runs
-- ALONGSIDE points. A stamp is added manually by staff (one tap per visit); when
-- the card fills it issues a counter code the diner collects like any other, then
-- the card resets. Owners can also manage every cardholder (search / adjust).
--
-- Design: stamps reuse the existing two-step counter flow (peek → claim). The
-- issued reward lives in its own `stamp_rewards` table (a third code source), so
-- peek_code / claim_code / diner_codes / diner_history each learn one new branch.

-- 1 · Config on the loyalty program ------------------------------------------
alter table loyalty_programs
  add column if not exists stamps_enabled  boolean not null default false,
  add column if not exists stamps_required integer not null default 10,
  add column if not exists stamp_reward    text    not null default 'Une récompense offerte';

alter table loyalty_programs drop constraint if exists loyalty_programs_stamps_required_ck;
alter table loyalty_programs
  add constraint loyalty_programs_stamps_required_ck check (stamps_required between 1 and 100);

-- 2 · The per-(café, phone) counter ------------------------------------------
create table if not exists loyalty_stamps (
  business_id uuid not null references businesses(id) on delete cascade,
  phone       text not null,
  count       integer not null default 0,   -- stamps toward the CURRENT card
  cycles      integer not null default 0,   -- completed cards (lifetime)
  updated_at  timestamptz not null default now(),
  primary key (business_id, phone)
);

-- 3 · A completed-card reward code, collected at the counter -----------------
create table if not exists stamp_rewards (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  phone       text not null,
  label       text not null,               -- snapshot of stamp_reward at completion
  code        text not null,
  status      text not null default 'pending' check (status in ('pending','claimed','expired','cancelled')),
  expires_at  timestamptz,
  claimed_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (business_id, code)
);
create index if not exists stamp_rewards_phone_idx on stamp_rewards(business_id, phone);

-- RLS: readable by the owning café only; writes happen through service-role RPCs.
alter table loyalty_stamps enable row level security;
alter table stamp_rewards  enable row level security;
drop policy if exists stamps_owner_read on loyalty_stamps;
create policy stamps_owner_read on loyalty_stamps for select using (pointili_owns_business(business_id));
drop policy if exists stamp_rewards_owner_read on stamp_rewards;
create policy stamp_rewards_owner_read on stamp_rewards for select using (pointili_owns_business(business_id));

-- 4 · add_stamp — the manual "+1". Completes + issues a code when the card fills.
create or replace function add_stamp(
  p_business_id uuid,
  p_phone       text,
  p_delta       integer default 1
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_prog      loyalty_programs%rowtype;
  v_req       integer;
  v_count     integer;
  v_cycles    integer;
  v_hrs       integer;
  v_code      text := null;
  v_completed integer := 0;
begin
  -- serialise stamps for this (café, phone): two tills can't both "complete" it.
  perform pg_advisory_xact_lock(hashtext(p_business_id::text || ':stamp:' || p_phone));

  if not cafe_is_live(p_business_id) then
    return jsonb_build_object('ok', false, 'reason', 'café indisponible');
  end if;

  select * into v_prog from loyalty_programs where business_id = p_business_id;
  if not found or not v_prog.stamps_enabled then
    return jsonb_build_object('ok', false, 'reason', 'tampons désactivés');
  end if;
  v_req := greatest(1, v_prog.stamps_required);

  insert into loyalty_stamps(business_id, phone, count)
  values (p_business_id, p_phone, greatest(0, coalesce(p_delta, 1)))
  on conflict (business_id, phone)
  do update set count = greatest(0, loyalty_stamps.count + coalesce(p_delta, 1)), updated_at = now()
  returning count, cycles into v_count, v_cycles;

  select coalesce(redeem_expiry_hours, 48) into v_hrs from loyalty_programs where business_id = p_business_id;

  -- Fill as many cards as the new count allows (usually exactly one).
  while v_count >= v_req loop
    v_count := v_count - v_req;
    v_cycles := v_cycles + 1;
    v_completed := v_completed + 1;

    loop
      v_code := pointili_gen_code();
      exit when not exists (
        select 1 from stamp_rewards       where business_id = p_business_id and code = v_code
        union all select 1 from loyalty_redemptions where business_id = p_business_id and code = v_code
        union all select 1 from wins             where business_id = p_business_id and code = v_code
      );
    end loop;

    insert into stamp_rewards(business_id, phone, label, code, status, expires_at)
    values (p_business_id, p_phone, v_prog.stamp_reward, v_code, 'pending',
            now() + make_interval(hours => coalesce(v_hrs, 48)));
  end loop;

  update loyalty_stamps set count = v_count, cycles = v_cycles, updated_at = now()
  where business_id = p_business_id and phone = p_phone;

  return jsonb_build_object(
    'ok', true,
    'count', v_count,
    'required', v_req,
    'completed', v_completed > 0,
    'code', v_code,               -- the last code issued, if any
    'label', v_prog.stamp_reward
  );
end;
$$;

-- 5 · peek_code — now also looks up stamp reward codes (kind = 'stamp') --------
create or replace function peek_code(p_business_id uuid, p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_label   text;
  v_kind    text;
  v_status  text;
  v_expires timestamptz;
begin
  select p.label, 'win', w.status, w.expires_at
    into v_label, v_kind, v_status, v_expires
  from wins w join prizes p on p.id = w.prize_id
  where w.business_id = p_business_id and w.code = p_code
  limit 1;

  if v_label is null then
    select lr.label, 'reward', r.status, r.expires_at
      into v_label, v_kind, v_status, v_expires
    from loyalty_redemptions r join loyalty_rewards lr on lr.id = r.reward_id
    where r.business_id = p_business_id and r.code = p_code
    limit 1;
  end if;

  if v_label is null then
    select sr.label, 'stamp', sr.status, sr.expires_at
      into v_label, v_kind, v_status, v_expires
    from stamp_rewards sr
    where sr.business_id = p_business_id and sr.code = p_code
    limit 1;
  end if;

  if v_label is null then
    return jsonb_build_object('found', false, 'status', 'not_found');
  end if;
  if v_status = 'claimed' then
    return jsonb_build_object('found', true, 'label', v_label, 'kind', v_kind, 'status', 'claimed');
  end if;
  if v_expires is not null and v_expires <= now() then
    return jsonb_build_object('found', true, 'label', v_label, 'kind', v_kind, 'status', 'expired');
  end if;
  return jsonb_build_object('found', true, 'label', v_label, 'kind', v_kind, 'status', 'valid');
end;
$$;

-- 6 · claim_code — collects wins, rewards, AND stamp rewards -------------------
create or replace function claim_code(p_business_id uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_label text;
  v_rows  integer;
begin
  update wins w set status = 'claimed', claimed_at = now()
  where w.business_id = p_business_id and w.code = p_code and w.status = 'pending'
    and (w.expires_at is null or w.expires_at > now())
  returning (select label from prizes where id = w.prize_id) into v_label;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    return jsonb_build_object('ok', true, 'label', v_label, 'kind', 'win');
  end if;

  update loyalty_redemptions r set status = 'claimed', claimed_at = now()
  where r.business_id = p_business_id and r.code = p_code and r.status = 'pending'
    and (r.expires_at is null or r.expires_at > now())
  returning (select label from loyalty_rewards where id = r.reward_id) into v_label;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    return jsonb_build_object('ok', true, 'label', v_label, 'kind', 'reward');
  end if;

  update stamp_rewards sr set status = 'claimed', claimed_at = now()
  where sr.business_id = p_business_id and sr.code = p_code and sr.status = 'pending'
    and (sr.expires_at is null or sr.expires_at > now())
  returning sr.label into v_label;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    return jsonb_build_object('ok', true, 'label', v_label, 'kind', 'stamp');
  end if;

  if exists (select 1 from wins where business_id = p_business_id and code = p_code and status = 'claimed')
     or exists (select 1 from loyalty_redemptions where business_id = p_business_id and code = p_code and status = 'claimed')
     or exists (select 1 from stamp_rewards where business_id = p_business_id and code = p_code and status = 'claimed') then
    return jsonb_build_object('ok', false, 'reason', 'déjà utilisé');
  end if;
  if exists (select 1 from wins where business_id = p_business_id and code = p_code)
     or exists (select 1 from loyalty_redemptions where business_id = p_business_id and code = p_code)
     or exists (select 1 from stamp_rewards where business_id = p_business_id and code = p_code) then
    return jsonb_build_object('ok', false, 'reason', 'expiré');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'introuvable');
end;
$$;

-- 7 · diner_codes — pending codes to show at the counter (+ stamp rewards) -----
create or replace function diner_codes(p_business_id uuid, p_phone text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(c order by c->>'expiresAt'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'code', w.code, 'label', p.label, 'kind', 'win', 'expiresAt', w.expires_at
    ) as c
    from wins w join prizes p on p.id = w.prize_id
    where w.business_id = p_business_id and w.phone = p_phone
      and w.status = 'pending' and (w.expires_at is null or w.expires_at > now())
    union all
    select jsonb_build_object(
      'code', r.code, 'label', lr.label, 'kind', 'reward', 'expiresAt', r.expires_at
    )
    from loyalty_redemptions r join loyalty_rewards lr on lr.id = r.reward_id
    where r.business_id = p_business_id and r.phone = p_phone
      and r.status = 'pending' and (r.expires_at is null or r.expires_at > now())
    union all
    select jsonb_build_object(
      'code', sr.code, 'label', sr.label, 'kind', 'stamp', 'expiresAt', sr.expires_at
    )
    from stamp_rewards sr
    where sr.business_id = p_business_id and sr.phone = p_phone
      and sr.status = 'pending' and (sr.expires_at is null or sr.expires_at > now())
  ) x;
$$;

-- 8 · diner_history — timeline now includes collected stamp rewards -----------
create or replace function diner_history(p_business_id uuid, p_phone text, p_limit int default 8)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('delta', e.delta, 'reason', e.reason, 'label', e.label, 'at', e.at)
    order by e.at desc
  ), '[]'::jsonb)
  from (
    select l.delta::int as delta, l.reason::text as reason, null::text as label, l.created_at as at
    from points_ledger l
    where l.business_id = p_business_id and l.customer_phone = p_phone
    union all
    select 0, 'collected', p.label, coalesce(w.claimed_at, w.created_at)
    from wins w join prizes p on p.id = w.prize_id
    where w.business_id = p_business_id and w.phone = p_phone and w.status = 'claimed'
    union all
    select 0, 'collected', lr.label, coalesce(r.claimed_at, r.created_at)
    from loyalty_redemptions r join loyalty_rewards lr on lr.id = r.reward_id
    where r.business_id = p_business_id and r.phone = p_phone and r.status = 'claimed'
    union all
    select 0, 'collected', sr.label, coalesce(sr.claimed_at, sr.created_at)
    from stamp_rewards sr
    where sr.business_id = p_business_id and sr.phone = p_phone and sr.status = 'claimed'
    order by at desc
    limit p_limit
  ) e;
$$;

-- 9 · Card management for the owner (Clients page) ---------------------------
-- Called via service-role with a business_id the server already proved is the
-- caller's (ownerCafe()), matching every other value RPC in this codebase.
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
      )
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'phone', phone, 'name', name, 'balance', balance,
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

-- Owner corrections. Points → an 'adjust' ledger row; stamps → an absolute set
-- (progress only, 0..required-1, so a manual set never silently issues a reward).
create or replace function owner_adjust_points(p_business_id uuid, p_phone text, p_delta integer)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_delta, 0) <> 0 then
    insert into points_ledger(business_id, customer_phone, delta, reason)
    values (p_business_id, p_phone, p_delta, 'adjust');
  end if;
  return jsonb_build_object('ok', true, 'balance', pointili_balance(p_business_id, p_phone));
end;
$$;

create or replace function owner_set_stamps(p_business_id uuid, p_phone text, p_count integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_req integer; v_c integer;
begin
  select greatest(1, stamps_required) into v_req from loyalty_programs where business_id = p_business_id;
  v_c := greatest(0, least(coalesce(p_count, 0), greatest(0, coalesce(v_req, 10) - 1)));
  insert into loyalty_stamps(business_id, phone, count) values (p_business_id, p_phone, v_c)
  on conflict (business_id, phone) do update set count = v_c, updated_at = now();
  return jsonb_build_object('ok', true, 'count', v_c, 'required', coalesce(v_req, 10));
end;
$$;

-- 10 · Lock every new / replaced value function to the service role -----------
do $$
declare fn text; fns text[] := array[
  'add_stamp(uuid, text, integer)',
  'peek_code(uuid, text)',
  'claim_code(uuid, text)',
  'diner_codes(uuid, text)',
  'diner_history(uuid, text, integer)',
  'owner_cards(uuid, text, integer, integer)',
  'owner_adjust_points(uuid, text, integer)',
  'owner_set_stamps(uuid, text, integer)'
];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
