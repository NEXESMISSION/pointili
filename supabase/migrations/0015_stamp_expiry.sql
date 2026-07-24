-- Stamp cards get an expiry, so an in-progress card doesn't linger forever (and
-- so the owner can run a time-boxed promo). Semantics, decided:
--   • stamp_expiry_days = 0 → never expires (default, backwards-compatible).
--   • A card's clock starts on its first stamp (loyalty_stamps.started_at).
--   • If the card lapses (started_at + expiry < now), the next stamp starts a
--     fresh card — old progress is dropped, but never any ISSUED reward code.
--   • Changing the setting affects the CURRENT card's live expiry (recomputed
--     from started_at); already-issued reward CODES keep the expiry they were
--     given at issue time. Disabling stamps freezes progress (nothing deleted).

alter table loyalty_programs add column if not exists stamp_expiry_days integer not null default 0;
alter table loyalty_programs drop constraint if exists loyalty_programs_stamp_expiry_ck;
alter table loyalty_programs add constraint loyalty_programs_stamp_expiry_ck check (stamp_expiry_days between 0 and 3650);

alter table loyalty_stamps add column if not exists started_at timestamptz;
update loyalty_stamps set started_at = updated_at where started_at is null;

-- add_stamp, now expiry-aware.
create or replace function add_stamp(
  p_business_id uuid,
  p_phone       text,
  p_delta       integer default 1
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_prog      loyalty_programs%rowtype;
  v_req       integer;
  v_hrs       integer;
  v_exp_days  integer;
  v_count     integer;
  v_cycles    integer;
  v_started   timestamptz;
  v_code      text := null;
  v_completed integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext(p_business_id::text || ':stamp:' || p_phone));

  if not cafe_is_live(p_business_id) then
    return jsonb_build_object('ok', false, 'reason', 'café indisponible');
  end if;

  select * into v_prog from loyalty_programs where business_id = p_business_id;
  if not found or not v_prog.stamps_enabled then
    return jsonb_build_object('ok', false, 'reason', 'tampons désactivés');
  end if;
  v_req      := greatest(1, v_prog.stamps_required);
  v_hrs      := coalesce(v_prog.redeem_expiry_hours, 48);
  v_exp_days := coalesce(v_prog.stamp_expiry_days, 0);

  select count, cycles, started_at into v_count, v_cycles, v_started
  from loyalty_stamps where business_id = p_business_id and phone = p_phone;
  v_count  := coalesce(v_count, 0);
  v_cycles := coalesce(v_cycles, 0);

  -- lapsed card → drop the stale progress and start fresh
  if v_exp_days > 0 and v_started is not null
     and v_started + make_interval(days => v_exp_days) < now() then
    v_count := 0;
    v_started := now();
  end if;
  if v_count = 0 or v_started is null then v_started := now(); end if;

  v_count := v_count + greatest(0, coalesce(p_delta, 1));

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
            now() + make_interval(hours => v_hrs));
    v_started := now(); -- the new card starts now
  end loop;

  insert into loyalty_stamps(business_id, phone, count, cycles, started_at, updated_at)
  values (p_business_id, p_phone, v_count, v_cycles, v_started, now())
  on conflict (business_id, phone)
  do update set count = excluded.count, cycles = excluded.cycles,
                started_at = excluded.started_at, updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'count', v_count,
    'required', v_req,
    'completed', v_completed > 0,
    'code', v_code,
    'label', v_prog.stamp_reward
  );
end;
$$;

do $$
begin
  execute 'revoke all on function add_stamp(uuid, text, integer) from public, anon, authenticated';
  execute 'grant execute on function add_stamp(uuid, text, integer) to service_role';
end $$;
