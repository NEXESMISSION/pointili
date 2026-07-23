-- Pointili — diner auth support (§04)
--
-- A 4-digit PIN is only 10,000 combinations, so the lockout is not optional: it
-- is the only thing between an attacker and a full sweep of the keyspace. It
-- lives in Postgres (not in memory) so a restart, a redeploy, or a second server
-- instance can't hand an attacker a fresh budget.

create table if not exists pin_attempts (
  phone        text primary key,
  count        integer not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

alter table pin_attempts enable row level security;
-- No policies: service-role only. Every anon/authenticated read is denied.

-- ---------------------------------------------------------------------------
-- Register a failed PIN attempt; lock the account after `p_max` tries.
-- ---------------------------------------------------------------------------
create or replace function pin_fail(
  p_phone   text,
  p_max     integer default 5,
  p_minutes integer default 15
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_lock  timestamptz;
begin
  insert into pin_attempts(phone, count) values (p_phone, 1)
  on conflict (phone) do update
    set count = pin_attempts.count + 1, updated_at = now()
  returning count into v_count;

  if v_count >= p_max then
    v_lock := now() + make_interval(mins => p_minutes);
    update pin_attempts
      set locked_until = v_lock, count = 0, updated_at = now()
      where phone = p_phone;
    return v_lock;
  end if;
  return null;
end;
$$;

/** Minutes remaining on a lockout, or 0. */
create or replace function pin_locked_for(p_phone text)
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0, ceil(extract(epoch from (locked_until - now())) / 60))::integer
  from pin_attempts
  where phone = p_phone and locked_until is not null and locked_until > now();
$$;

create or replace function pin_clear(p_phone text)
returns void language sql security definer set search_path = public as $$
  delete from pin_attempts where phone = p_phone;
$$;

-- ---------------------------------------------------------------------------
-- Claim a counter code exactly once. Handles BOTH wins and redemptions, and is
-- atomic: the UPDATE ... WHERE status='pending' is the guard, so two staff
-- scanning the same code concurrently can't both succeed.
-- ---------------------------------------------------------------------------
create or replace function claim_code(p_business_id uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_label text;
  v_kind  text;
  v_rows  integer;
begin
  -- try a wheel win first
  update wins w set status = 'claimed'
  where w.business_id = p_business_id and w.code = p_code and w.status = 'pending'
    and (w.expires_at is null or w.expires_at > now())
  returning (select label from prizes where id = w.prize_id) into v_label;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    return jsonb_build_object('ok', true, 'label', v_label, 'kind', 'win');
  end if;

  -- then a boutique redemption
  update loyalty_redemptions r set status = 'claimed'
  where r.business_id = p_business_id and r.code = p_code and r.status = 'pending'
    and (r.expires_at is null or r.expires_at > now())
  returning (select label from loyalty_rewards where id = r.reward_id) into v_label;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    return jsonb_build_object('ok', true, 'label', v_label, 'kind', 'reward');
  end if;

  -- nothing claimable — say why
  if exists (select 1 from wins where business_id = p_business_id and code = p_code and status = 'claimed')
     or exists (select 1 from loyalty_redemptions where business_id = p_business_id and code = p_code and status = 'claimed') then
    return jsonb_build_object('ok', false, 'reason', 'déjà utilisé');
  end if;
  if exists (select 1 from wins where business_id = p_business_id and code = p_code)
     or exists (select 1 from loyalty_redemptions where business_id = p_business_id and code = p_code) then
    return jsonb_build_object('ok', false, 'reason', 'expiré');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'introuvable');
end;
$$;

-- ---------------------------------------------------------------------------
-- Every code a diner can currently show at the counter (wins + redemptions).
-- ---------------------------------------------------------------------------
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
  ) x;
$$;

-- Lock every new function down (PUBLIC gets EXECUTE by default — see 0003).
do $$
declare
  fn text;
  fns text[] := array[
    'pin_fail(text, integer, integer)',
    'pin_locked_for(text)',
    'pin_clear(text)',
    'claim_code(uuid, text)',
    'diner_codes(uuid, text)'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
