-- The console described the REQUEST, not the RESULT.
--
-- Both platform RPCs returned a bare `ok:true` with no post-state, so the server
-- action composed its French sentence from the form values it had just sent —
-- in a branch order that does not match the one Postgres actually used.
--
-- The worst case is not cosmetic. setPlanAction tests `plan === 'free'` BEFORE
-- `amount === 0`, while admin_set_plan (0021) correctly tests amount 0 first. So
-- "Gratuit" with duration 0 reports « Formule gratuite (illimitée) appliquée »
-- at the exact moment it set the expiry to now() and took the shop dark. The
-- operator reads "unlimited" and the café is off.
--
-- The fix is to stop guessing: every RPC returns what the row LOOKS LIKE
-- afterwards, and the UI reports that.

create or replace function admin_set_suspended(
  p_actor       uuid,
  p_business_id uuid,
  p_suspended   boolean,
  p_reason      text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_live boolean; v_until timestamptz; v_rows integer;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if p_suspended then
    update businesses
       set suspended_at = now(), suspended_reason = p_reason, status = 'disabled'
     where id = p_business_id;
  else
    update businesses
       set suspended_at = null, suspended_reason = null, status = 'active'
     where id = p_business_id;
  end if;

  -- A no-op UPDATE used to return ok:true, so the console could report
  -- « Café suspendu » about a café that does not exist.
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;

  perform admin_log(p_actor,
    case when p_suspended then 'suspend' else 'unsuspend' end,
    p_business_id, jsonb_build_object('reason', p_reason));

  -- The POST-STATE. Reactivating does not necessarily make a café live: its
  -- subscription may have expired while it was suspended, and saying
  -- « Café réactivé » about a shop that is still dark is how an operator ends up
  -- believing they fixed something they did not.
  select cafe_is_live(id), plan_expires_at into v_live, v_until
    from businesses where id = p_business_id;

  return jsonb_build_object('ok', true, 'live', v_live, 'until', v_until);
end;
$$;

-- Same treatment for the plan lever: it already returned `until`, but it could
-- report success on a business id that matched nothing.
create or replace function admin_set_plan(
  p_actor       uuid,
  p_business_id uuid,
  p_plan        text,
  p_amount      integer default 1,
  p_unit        text    default 'months'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_until timestamptz;
  v_from  timestamptz;
  v_add   interval;
  v_live  boolean;
  v_rows  integer;
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

  -- 0 means "cut them off now", on EVERY plan. Checked first, so 'free' cannot
  -- swallow it — and the UI must read this order from the result, not guess it.
  if p_amount = 0 then
    v_until := now();
  elsif p_plan = 'free' then
    v_until := null;                       -- 'free' is unlimited: no expiry
  else
    v_add := case p_unit
      when 'hours'  then make_interval(hours  => p_amount)
      when 'days'   then make_interval(days   => p_amount)
      else               make_interval(months => p_amount)
    end;

    select greatest(now(), coalesce(plan_expires_at, now()))
      into v_from from businesses where id = p_business_id for update;

    v_until := v_from + v_add;
  end if;

  update businesses
     set plan = p_plan, plan_expires_at = v_until
   where id = p_business_id;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;

  perform admin_log(p_actor, 'set_plan', p_business_id,
    jsonb_build_object('plan', p_plan, 'amount', p_amount, 'unit', p_unit, 'until', v_until));

  select cafe_is_live(id) into v_live from businesses where id = p_business_id;

  return jsonb_build_object('ok', true, 'until', v_until, 'live', v_live, 'plan', p_plan);
end;
$$;

do $$
declare fn text; fns text[] := array[
  'admin_set_suspended(uuid, uuid, boolean, text)',
  'admin_set_plan(uuid, uuid, text, integer, text)'
];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
