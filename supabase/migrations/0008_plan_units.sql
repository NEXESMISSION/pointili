-- Pointili — subscriptions in hours / days / months
--
-- Months alone can't express what an operator actually does: a 48-hour grace
-- extension while an owner sorts out payment, a 14-day pilot, a weekend trial.
-- Replaces admin_set_plan(p_months) with an amount + unit.

drop function if exists admin_set_plan(uuid, uuid, text, integer);

create or replace function admin_set_plan(
  p_actor       uuid,
  p_business_id uuid,
  p_plan        text,
  p_amount      integer default 1,
  p_unit        text default 'months'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_until timestamptz;
  v_from  timestamptz;
  v_add   interval;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_plan not in ('trial', 'free', 'pro') then
    return jsonb_build_object('ok', false, 'reason', 'bad_plan');
  end if;
  if p_unit not in ('hours', 'days', 'months') then
    return jsonb_build_object('ok', false, 'reason', 'bad_unit');
  end if;
  if p_amount < 0 or p_amount > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_amount');
  end if;

  if p_plan = 'free' then
    -- 'free' is unlimited: no expiry at all.
    v_until := null;
  else
    v_add := case p_unit
      when 'hours'  then make_interval(hours  => p_amount)
      when 'days'   then make_interval(days   => p_amount)
      else               make_interval(months => p_amount)
    end;

    -- Extend from whichever is later: now, or the CURRENT expiry. Renewing
    -- early must not burn the remaining time.
    select greatest(now(), coalesce(plan_expires_at, now()))
      into v_from from businesses where id = p_business_id;

    -- amount 0 → expire immediately (a deliberate "cut them off now")
    v_until := case when p_amount = 0 then now() else v_from + v_add end;
  end if;

  update businesses
     set plan = p_plan, plan_expires_at = v_until
   where id = p_business_id;

  perform admin_log(p_actor, 'set_plan', p_business_id,
    jsonb_build_object('plan', p_plan, 'amount', p_amount, 'unit', p_unit, 'until', v_until));

  return jsonb_build_object('ok', true, 'plan', p_plan, 'expiresAt', v_until);
end;
$$;

do $$
begin
  execute 'revoke all on function admin_set_plan(uuid, uuid, text, integer, text) from public, anon, authenticated';
  execute 'grant execute on function admin_set_plan(uuid, uuid, text, integer, text) to service_role';
end $$;
