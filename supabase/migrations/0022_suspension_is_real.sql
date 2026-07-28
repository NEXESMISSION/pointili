-- Suspension was a convention, not a state.
--
-- `cafe_is_live()` is the platform's only lever over a shop that has not paid,
-- and it was honoured by three RPCs and ignored by four. So a café the operator
-- had switched off could still put value on a customer's card from its own
-- till: the « Créditer » button correctly refused, and « Corriger / Historique »
-- — the button directly beneath it — happily added the same points. Stamps,
-- reward collection and new sign-ups all kept working too, while the console
-- showed a red dot and pointsIssued climbed.
--
-- Verified before this migration:
--     credit_points        GATED
--     add_stamp            GATED
--     redeem_at_counter    GATED
--     owner_adjust_points  NO GATE   ← the workaround, one tap away
--     owner_set_stamps     NO GATE
--     claim_code           NO GATE
--     enroll_diner         NO GATE
--
-- Every one of these is reached only through an authenticated owner action, so
-- the gate is about the SHOP's status, not the caller's identity. The RPCs
-- return their existing failure shape so no caller needs to change.

-- 1 ─────────────────────────────────────────────────────────────────────────
-- The correction path. This is the important one: it is the workaround that
-- made suspension meaningless, and it can mint unlimited points.
create or replace function owner_adjust_points(p_business_id uuid, p_phone text, p_delta integer)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not cafe_is_live(p_business_id) then
    return jsonb_build_object('ok', false, 'reason', 'café indisponible');
  end if;

  if coalesce(p_delta, 0) <> 0 then
    insert into points_ledger(business_id, customer_phone, delta, reason)
    values (p_business_id, p_phone, p_delta, 'adjust');
  end if;
  return jsonb_build_object('ok', true, 'balance', pointili_balance(p_business_id, p_phone));
end;
$$;

-- 2 ─────────────────────────────────────────────────────────────────────────
-- The stamp correction, same story.
create or replace function owner_set_stamps(p_business_id uuid, p_phone text, p_count integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_req integer; v_c integer;
begin
  if not cafe_is_live(p_business_id) then
    return jsonb_build_object('ok', false, 'reason', 'café indisponible');
  end if;

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

-- 3 ─────────────────────────────────────────────────────────────────────────
-- Collecting a reward at the counter.
--
-- A dark shop must not serve. The code is NOT consumed by this refusal — it
-- stays 'pending' and is collectable the moment the shop is back, which is the
-- behaviour the diner is promised ("tes points sont conservés").
create or replace function claim_code(p_business_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_label text;
  v_rows  integer;
begin
  if not cafe_is_live(p_business_id) then
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

-- 4 ─────────────────────────────────────────────────────────────────────────
-- Joining a café.
--
-- Returns NULL rather than a code when the shop is dark. Every caller already
-- treats a null as "could not activate the card" — /[slug]/rejoindre says so and
-- refuses to continue — so a dark shop stops recruiting instead of silently
-- collecting customers it cannot serve.
create or replace function enroll_diner(p_business_id uuid, p_phone text)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  -- An EXISTING member is always resolvable: this is also how a diner reaches a
  -- shop that has gone dark since they joined, so they can still read the card
  -- that tells them their points are safe.
  select code into v_code from diner_cafes
  where business_id = p_business_id and phone = p_phone;
  if found then return v_code; end if;

  if not cafe_is_live(p_business_id) then return null; end if;

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

-- Re-lock everything this file touched.
do $$
declare fn text; fns text[] := array[
  'owner_adjust_points(uuid, text, integer)',
  'owner_set_stamps(uuid, text, integer)',
  'claim_code(uuid, text)',
  'enroll_diner(uuid, text)'
];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
