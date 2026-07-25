-- Fixes from the diner-workflow bug hunt.
--
--  1. create_cafe must reserve every REAL root route. "cartes" (the wallet) and
--     "auth" were missing, so a café could be created on a slug that Next.js
--     permanently shadows — the shop would be unreachable forever.
--  2. diner_wallet's pending-code badge counted EXPIRED codes: it filtered only
--     on status='pending' while diner_codes also requires expires_at > now(), so
--     the wallet advertised codes that "Mes codes" said didn't exist. Nothing
--     ever flips a lapsed row to 'expired', so this was permanent.
--  3. diner_wallet now reports whether the shop's stamp programme is ON, so the
--     wallet stops showing stamp progress for a programme that was switched off.
--  4. owner_set_stamps never set started_at, so a card the owner had just
--     corrected rendered as lapsed (or with no expiry) on the diner's carte.

-- 1 ---------------------------------------------------------------------------
create or replace function create_cafe(
  p_owner_id uuid,
  p_name     text,
  p_slug     text,
  p_color    text default '#5b3fd1'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' then
    return jsonb_build_object('ok', false, 'reason', 'slug_invalid');
  end if;
  -- keep in step with RESERVED_SLUGS in lib/data.ts
  if p_slug in ('owner','admin','api','auth','cartes','login','signup','logout','app','static',
                '_next','favicon.ico','icon.png','apple-icon.png','robots.txt','sitemap.xml') then
    return jsonb_build_object('ok', false, 'reason', 'slug_reserved');
  end if;
  if exists (select 1 from businesses where slug = p_slug) then
    return jsonb_build_object('ok', false, 'reason', 'slug_taken');
  end if;

  -- A real trial: 14 days, then the café goes dark until a plan is granted.
  insert into businesses (owner_id, name, slug, status, primary_color, plan, plan_expires_at)
  values (p_owner_id, p_name, p_slug, 'active', p_color, 'trial', now() + interval '14 days')
  returning id into v_id;

  insert into loyalty_programs (business_id, active, points_per_tnd, welcome_points, redeem_expiry_hours)
  values (v_id, true, 1, 10, 48);

  insert into loyalty_rewards (business_id, label, points_cost, active, position) values
    (v_id, 'Espresso offert',    40,  true, 0),
    (v_id, 'Cappuccino offert',  80,  true, 1),
    (v_id, 'Pâtisserie du jour', 120, true, 2),
    (v_id, 'Brunch complet',     300, true, 3);

  return jsonb_build_object('ok', true, 'id', v_id, 'slug', p_slug);
end;
$$;

create or replace function slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'
     and p_slug not in ('owner','admin','api','auth','cartes','login','signup','logout','app','static',
                        '_next','favicon.ico','icon.png','apple-icon.png','robots.txt','sitemap.xml')
     and not exists (select 1 from businesses where slug = p_slug);
$$;

-- 2 + 3 -----------------------------------------------------------------------
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
      -- only meaningful while the shop actually runs a stamp card
      'stampsEnabled', coalesce((select lp.stamps_enabled from loyalty_programs lp
                        where lp.business_id = b.id), false),
      'stamps',       (select coalesce(count, 0) from loyalty_stamps s
                        where s.business_id = b.id and s.phone = p_phone),
      -- pending AND still valid — matches diner_codes, so the badge can never
      -- advertise a code the codes page refuses to show
      'pendingWins',  (select count(*) from wins w
                        where w.business_id = b.id and w.phone = p_phone
                          and w.status = 'pending'
                          and (w.expires_at is null or w.expires_at > now())),
      'pendingRewards', (
                        (select count(*) from loyalty_redemptions r
                          where r.business_id = b.id and r.phone = p_phone
                            and r.status = 'pending'
                            and (r.expires_at is null or r.expires_at > now()))
                      + (select count(*) from stamp_rewards sr
                          where sr.business_id = b.id and sr.phone = p_phone
                            and sr.status = 'pending'
                            and (sr.expires_at is null or sr.expires_at > now())))
    ) as card
    from businesses b
    where b.id in (
      select business_id from points_ledger where customer_phone = p_phone
      union
      select business_id from diner_cafes where phone = p_phone
    )
  ) cards;
$$;

-- 4 ---------------------------------------------------------------------------
create or replace function owner_set_stamps(p_business_id uuid, p_phone text, p_count integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_req integer; v_c integer;
begin
  select greatest(1, stamps_required) into v_req from loyalty_programs where business_id = p_business_id;
  v_c := greatest(0, least(coalesce(p_count, 0), greatest(0, coalesce(v_req, 10) - 1)));
  -- started_at drives the card's expiry on the diner's screen: a correction
  -- starts a fresh card (or clears the clock when the owner zeroes it).
  insert into loyalty_stamps(business_id, phone, count, started_at)
  values (p_business_id, p_phone, v_c, case when v_c > 0 then now() else null end)
  on conflict (business_id, phone) do update
    set count = v_c,
        started_at = case when v_c > 0 then coalesce(loyalty_stamps.started_at, now()) else null end,
        updated_at = now();
  return jsonb_build_object('ok', true, 'count', v_c, 'required', coalesce(v_req, 10));
end;
$$;

do $$
declare fn text; fns text[] := array[
  'create_cafe(uuid, text, text, text)',
  'slug_available(text)',
  'diner_wallet(text)',
  'owner_set_stamps(uuid, text, integer)'
];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
