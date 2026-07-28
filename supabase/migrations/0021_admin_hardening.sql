-- Super-admin hardening: close the privilege escalation, and fix four defects
-- in the console's own actions.
--
-- The escalation is the important one. Everything else in this file is a small
-- correctness fix; item 1 is the difference between "the platform has an
-- operator" and "every customer is an operator".

-- 1 ─────────────────────────────────────────────────────────────────────────
-- ANY OWNER COULD MAKE THEMSELVES A SUPER-ADMIN.
--
-- `grant select, update on profiles to authenticated` is a TABLE grant with no
-- column list, and the only policy on the table (profiles_self) filters WHICH
-- ROW, never which column. `role` was therefore writable by its owner, and
-- 'super_admin' is a legal value under the CHECK. Signup is open, so the whole
-- chain was: sign up → PATCH your own profiles row with the anon key that ships
-- in the browser bundle → elevate with your own password → full console, plus
-- pointili_is_super_admin() making pointili_owns_business() true for EVERY
-- tenant.
--
-- Nothing in the application ever writes to profiles (the only access is a read
-- in lib/auth/owner.ts), so the grant was pure excess privilege.
revoke update on profiles from authenticated;

-- 2 ─────────────────────────────────────────────────────────────────────────
-- AN OWNER COULD GRANT THEMSELVES AN UNLIMITED PLAN AND LIFT A SUSPENSION.
--
-- Same shape on `businesses`, but this table cannot simply be revoked: the
-- owner's settings screen legitimately writes to it through the authenticated
-- role (app/owner/(app)/reglages/actions.ts).
--
-- So the grant becomes COLUMN-level. An owner keeps the columns that describe
-- their shop and loses the ones that describe their relationship with the
-- platform: plan, plan_expires_at, suspended_at, suspended_reason, status —
-- exactly the columns cafe_is_live() reads, which is the sole enforcement point
-- for both subscription expiry and suspension. Those move to the audited
-- admin_* RPCs, which is where they were always supposed to live.
--
-- owner_id and id are excluded too: being able to rewrite owner_id is a way to
-- hand yourself someone else's café.
revoke update on businesses from authenticated;
grant update (name, primary_color, logo_url, design_settings, business_type)
  on businesses to authenticated;

-- INSERT stays revoked: cafés are created only through create_cafe(), which
-- enforces the slug rules and seeds the programme in the same transaction. A
-- direct insert would produce a café with no loyalty_programs row.
revoke insert, delete on businesses from authenticated;

-- 3 ─────────────────────────────────────────────────────────────────────────
-- "0 = COUPER MAINTENANT" DID THE OPPOSITE ON A CAFÉ ALREADY ON 'free'.
--
-- The 'free' branch set v_until := null and returned before the p_amount = 0
-- check was ever reached, and cafe_is_live() treats a null expiry as live. The
-- plan <select> defaults to the café's CURRENT plan, so a free café arrived
-- pre-selected on the one plan where 0 means "forever" rather than "now".
--
-- Also adds FOR UPDATE. The read-modify-write had no lock, so two operators
-- granting "+1 month" at the same time produced +1 month, not +2 — the only
-- lock-free read-modify-write left among the value RPCs.
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

  -- 0 means "cut them off now", on EVERY plan. Checked first, so 'free' can no
  -- longer swallow it.
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

    -- Extend from whichever is later: now, or the CURRENT expiry. Renewing
    -- early must not burn the remaining time. FOR UPDATE so a concurrent grant
    -- cannot read the same baseline and overwrite the other's extension.
    select greatest(now(), coalesce(plan_expires_at, now()))
      into v_from from businesses where id = p_business_id for update;

    v_until := v_from + v_add;
  end if;

  update businesses
     set plan = p_plan, plan_expires_at = v_until
   where id = p_business_id;

  perform admin_log(p_actor, 'set_plan', p_business_id,
    jsonb_build_object('plan', p_plan, 'amount', p_amount, 'unit', p_unit, 'until', v_until));

  return jsonb_build_object('ok', true, 'until', v_until);
end;
$$;

-- 4 ─────────────────────────────────────────────────────────────────────────
-- A NOTICE POSTED WITH 0 DAYS NEVER EXPIRED.
--
-- `case when p_days > 0 then … end` has no ELSE, so 0 yielded NULL, and both
-- the RLS policy and owner_notices() read NULL as "never expires". Meanwhile 0
-- means "immediately" for the plan lever in the SAME drawer — two inputs, both
-- min={0}, meaning opposite things. Now 0 expires it at once, and a negative
-- value (reachable from a crafted request: the action only checks
-- Number.isInteger) is refused rather than silently becoming permanent.
create or replace function admin_notice(
  p_actor       uuid,
  p_business_id uuid,
  p_kind        text,
  p_message     text,
  p_days        integer default 14
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if coalesce(trim(p_message), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;
  if p_days < 0 or p_days > 365 then
    return jsonb_build_object('ok', false, 'reason', 'bad_days');
  end if;

  insert into platform_notices (business_id, kind, message, expires_at)
  values (p_business_id, p_kind, trim(p_message),
          case when p_days > 0 then now() + make_interval(days => p_days) else now() end)
  returning id into v_id;

  perform admin_log(p_actor, 'notice', p_business_id,
    jsonb_build_object('kind', p_kind, 'message', p_message, 'days', p_days));

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- 5 ─────────────────────────────────────────────────────────────────────────
-- RETRACTING A NOTICE LEFT NO TRACE.
--
-- Every other privileged action writes an admin_log row, and 0007's own header
-- says "every privileged action is written down, immutably". Nothing ever sets
-- active back to true, so an urgent platform-wide message could be killed
-- permanently with no record of who did it.
create or replace function admin_dismiss_notice(p_actor uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_business uuid;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  update platform_notices set active = false
   where id = p_id
   returning business_id into v_business;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  perform admin_log(p_actor, 'dismiss_notice', v_business,
    jsonb_build_object('notice_id', p_id));

  return jsonb_build_object('ok', true);
end;
$$;

-- Re-lock everything this file touched.
do $$
declare fn text; fns text[] := array[
  'admin_set_plan(uuid, uuid, text, integer, text)',
  'admin_notice(uuid, uuid, text, text, integer)',
  'admin_dismiss_notice(uuid, uuid)'
];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
