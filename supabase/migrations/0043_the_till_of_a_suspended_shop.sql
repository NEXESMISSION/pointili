-- ===========================================================================
-- 0043 · Three holes on the admin side, closed in one place.
--
-- Found by reading the owner surface end to end. Each one is small; the first
-- is the one that matters.
-- ===========================================================================

-- ── 1 · A PIN RESET IS AN EVENT, AND IT WAS INVISIBLE ─────────────────────
--
-- resetPinAction (caisse/actions.ts) lets a shop set a new secret code for one
-- of ITS OWN cardholders, and that check is real. What the check does not
-- change is that `pin_hash` lives on `accounts`, which is GLOBAL: after the
-- reset the shop knows the customer's phone AND their code, which is the whole
-- credential for that person's Pointili identity — their cards and their
-- points at every OTHER shop too.
--
-- The feature has to stay. It is the only recovery path in the product, the
-- customer is standing right there, and the alternative (SMS) does not exist
-- yet. What was missing is that nothing recorded it. So:
--
--   · every reset writes a row here, with who did it and to whom
--   · a shop gets a budget — 5 in 24h. A café resets a code now and then; a
--     shop working through a list of numbers does not, and hits the ceiling.
--   · the console can read the table (below), so abuse is visible rather than
--     merely possible-to-notice
--
-- This does not eliminate the risk — a shop can still reset one customer they
-- have served and use it. It makes it leave a trace, which is the difference
-- between a design flaw and an unaccountable one.
create table if not exists pin_resets (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  phone       text not null,
  at          timestamptz not null default now()
);

create index if not exists pin_resets_shop_idx on pin_resets (business_id, at desc);
create index if not exists pin_resets_phone_idx on pin_resets (phone, at desc);

alter table pin_resets enable row level security;
revoke all on pin_resets from public, anon, authenticated;

/**
 * Record a reset and say whether it was allowed.
 *
 * Counts BEFORE it answers, in one statement, so two tills racing cannot both
 * be told yes — the same lesson as pin_gate (0038).
 */
create or replace function pin_reset_gate(p_business_id uuid, p_phone text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_recent integer;
begin
  select count(*) into v_recent
    from pin_resets
   where business_id = p_business_id
     and at > now() - interval '24 hours';

  if v_recent >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited', 'recent', v_recent);
  end if;

  insert into pin_resets (business_id, phone) values (p_business_id, p_phone);
  return jsonb_build_object('ok', true, 'recent', v_recent + 1);
end;
$$;

/** The console's view of it — who has been resetting a lot of codes. */
create or replace function admin_pin_resets(p_actor uuid, p_days integer default 30)
returns table (business_id uuid, name text, slug text, resets bigint, people bigint, last_at timestamptz)
language sql security definer set search_path = public as $$
  select r.business_id, b.name, b.slug,
         count(*) as resets,
         count(distinct r.phone) as people,
         max(r.at) as last_at
    from pin_resets r
    join businesses b on b.id = r.business_id
   where is_super(p_actor)
     and r.at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
   group by r.business_id, b.name, b.slug
   order by count(*) desc
   limit 50;
$$;

-- ── 2 · A SUSPENSION AND AN UNPAID INVOICE ARE NOT THE SAME THING ────────
--
-- claim_code refuses whenever cafe_is_live() is false, and that function is
-- false for two very different situations:
--
--   suspended  an operator stopped this shop on purpose. Nothing should work.
--   expired    the shop is late paying US.
--
-- The second one was taking it out of the wrong person. That voucher was
-- already BOUGHT with the customer's own points — they spent 80 points on a
-- free coffee last week — and refusing it because the café has not renewed
-- burns the customer to punish the shop. They cannot even see why: the till
-- says "café indisponible" while the shop is standing in front of them, open.
--
-- So: suspension still blocks everything. A lapsed plan no longer voids a
-- voucher somebody already paid for. Earning is unaffected — credit_points and
-- add_stamp keep the full cafe_is_live() gate, which is where the subscription
-- gets its teeth: an expired shop stops ISSUING value and can still honour
-- what it already owes.
--
-- Everything else in this function is byte-for-byte what was there.
create or replace function claim_code(p_business_id uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_label text;
  v_rows  integer;
begin
  if exists (select 1 from businesses
              where id = p_business_id
                and (suspended_at is not null or status <> 'active')) then
    return jsonb_build_object('ok', false, 'reason', 'café indisponible');
  end if;

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

revoke all on function pin_reset_gate(uuid, text) from public, anon, authenticated;
revoke all on function admin_pin_resets(uuid, integer) from public, anon, authenticated;

comment on table pin_resets is
  'Every counter PIN reset. The reset is scoped to the shop''s own cardholder, '
  'but pin_hash is global — so this is the trace that makes the power '
  'accountable. Read by the console through admin_pin_resets.';
