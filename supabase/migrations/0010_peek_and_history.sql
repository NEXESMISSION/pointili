-- Counter flow becomes two-step (look up, THEN collect) and the diner's history
-- starts recording what they actually collected.
--
--  1. peek_code()   — read-only lookup so staff can SHOW a code without serving
--                     it (a diner sometimes just wants to see it).
--  2. claimed_at    — record WHEN a code was collected, not just that it was.
--  3. claim_code()  — now stamps claimed_at on collect.
--  4. diner_history — the points ledger PLUS collected wins/rewards, one timeline.

-- 1 + 2 -----------------------------------------------------------------------
alter table wins                add column if not exists claimed_at timestamptz;
alter table loyalty_redemptions add column if not exists claimed_at timestamptz;

-- Read-only: tells staff what a code is and whether it can be served, and never
-- changes anything. status ∈ valid | expired | claimed | not_found.
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

-- 3 ---------------------------------------------------------------------------
create or replace function claim_code(p_business_id uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_label text;
  v_kind  text;
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

-- 4 ---------------------------------------------------------------------------
-- The diner's timeline: points events + what they collected at the counter.
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
    order by at desc
    limit p_limit
  ) e;
$$;

-- Same lockdown as every other value RPC: only service_role may execute.
do $$
declare fn text; fns text[] := array[
  'peek_code(uuid, text)', 'diner_history(uuid, text, integer)'
];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
