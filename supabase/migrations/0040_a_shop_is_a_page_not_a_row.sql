-- ===========================================================================
-- 0040 · A SHOP IS A PAGE, NOT A ROW IN A DRAWER
--
-- The console has one screen. Everything the platform can say is stacked on it:
-- a stat line, an alert queue, the renewal queue, the early-access list, the
-- whole café table, the traffic panel, and three folded drawers holding
-- broadcast, notices and the audit log. Nothing on it has an address, so
-- nothing can be linked, bookmarked or returned to.
--
-- The worst of it is what happens to a CAFÉ. It is the central object of this
-- platform — the thing that pays, the thing that goes dark, the thing an
-- operator is asked about on the phone — and it is a table row that opens a
-- modal with four aggregate numbers and three form controls in it. If somebody
-- writes in saying "my customers lost their points last Tuesday", the console
-- cannot help: it has no history, no ledger, no record of what WE did to that
-- shop and when.
--
-- So the console becomes many pages, and a café gets one of its own. This
-- migration is the data that page needs and the console has never had.
--
-- ── ONE ROUND TRIP, NOT FOURTEEN ──────────────────────────────────────────
-- admin_cafe_detail returns the whole page as a single jsonb. Same reasoning as
-- admin_traffic (0028): the panels have to AGREE with each other, and they
-- cannot if they are read at fourteen different moments — a shop that redeems a
-- reward between query four and query nine renders a ledger that contradicts
-- its own totals.
--
-- ── CUSTOMER PHONE NUMBERS ARE MASKED, EVEN HERE ──────────────────────────
-- The till has never shown a cardholder's full number to the shop that serves
-- them, and there is a passing test that says so. A console does not get to be
-- the exception just because its reader is trusted: this screen is read over
-- somebody's shoulder, screenshotted into a support thread and left open on a
-- laptop. The last three digits identify a row while a call is happening, which
-- is the only thing the operator actually needs, and anyone who genuinely needs
-- the whole number has the database.
-- ===========================================================================

/**
 * Everything one shop's page shows.
 *
 * Ordered as the page reads it: who they are, what they are paying, what their
 * loyalty programme is set to, what the numbers say, what the till has been
 * doing, and what WE have done to them.
 */
create or replace function admin_cafe_detail(p_actor uuid, p_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select case when not is_super(p_actor) then jsonb_build_object('ok', false)
  else (
    select jsonb_build_object(
      'ok', true,

      /* ── identity and status ── */
      'shop', jsonb_build_object(
        'id',              b.id,
        'name',            b.name,
        'slug',            b.slug,
        'status',          b.status,
        'businessType',    b.business_type,
        'primaryColor',    b.primary_color,
        'logoUrl',         b.logo_url,
        'phone',           b.phone,
        'plan',            b.plan,
        'planExpiresAt',   b.plan_expires_at,
        'suspendedAt',     b.suspended_at,
        'suspendedReason', b.suspended_reason,
        'live',            cafe_is_live(b.id),
        'createdAt',       b.created_at,
        'ownerId',         b.owner_id,
        'ownerEmail',      p.email
      ),

      /* ── how the programme is configured ──
         The operator is asked "why did my client only get 3 points?" more often
         than anything else, and the answer is always one of these numbers. They
         were readable nowhere in the console. */
      'program', coalesce((
        select jsonb_build_object(
          'active',           lp.active,
          'pointsPerTnd',     lp.points_per_tnd,
          'welcomePoints',    lp.welcome_points,
          'redeemExpiryHours',lp.redeem_expiry_hours,
          'stampsEnabled',    lp.stamps_enabled,
          'stampsRequired',   lp.stamps_required,
          'stampReward',      lp.stamp_reward
        ) from loyalty_programs lp where lp.business_id = b.id
      ), 'null'::jsonb),

      /* ── the numbers ──
         `spent` as a positive figure: points_ledger stores redemptions as a
         negative delta, and a panel reading "-420 points dépensés" makes the
         reader do the sign in their head every time. */
      'totals', jsonb_build_object(
        'customers',    (select count(distinct customer_phone) from points_ledger l where l.business_id = b.id),
        'issued',       (select coalesce(sum(delta), 0) from points_ledger l where l.business_id = b.id and l.delta > 0),
        'spent',        (select coalesce(-sum(delta), 0) from points_ledger l where l.business_id = b.id and l.delta < 0),
        'entries',      (select count(*) from points_ledger l where l.business_id = b.id),
        'revenueTnd',   (select coalesce(sum(amount_tnd), 0) from points_ledger l where l.business_id = b.id and l.reason = 'earn'),
        'lastActivity', (select max(created_at) from points_ledger l where l.business_id = b.id),
        'newCards30d',  (select count(*) from diner_cafes d
                          where d.business_id = b.id and d.first_played_at > now() - interval '30 days'),
        'active30d',    (select count(distinct customer_phone) from points_ledger l
                          where l.business_id = b.id and l.created_at > now() - interval '30 days'),
        'earns30d',     (select count(*) from points_ledger l
                          where l.business_id = b.id and l.reason = 'earn'
                            and l.created_at > now() - interval '30 days')
      ),

      /* ── thirty days of till activity, zero-filled ──
         generate_series, not group-by-day: a chart that silently drops empty
         days draws a shop that closed for a fortnight as a shop that was busy
         throughout. The gap IS the information here. */
      'daily', coalesce((
        select jsonb_agg(jsonb_build_object('day', d::date, 'n', c) order by d)
        from generate_series(current_date - 29, current_date, interval '1 day') d
        left join lateral (
          select count(*) as c from points_ledger l
           where l.business_id = b.id
             and l.reason = 'earn'
             and l.created_at >= d and l.created_at < d + interval '1 day'
        ) x on true
      ), '[]'::jsonb),

      /* ── the reward ladder, WITH how often each one is actually taken ──
         An owner asking "is my programme working?" is asking this and nothing
         else. A reward nobody has ever redeemed is the most actionable fact
         about a shop and it existed in no screen. */
      'rewards', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',     r.id,
          'label',  r.label,
          'cost',   r.points_cost,
          'active', r.active,
          'taken',  (select count(*) from points_ledger l
                      where l.business_id = b.id and l.reason = 'redeem'
                        and abs(l.delta) = r.points_cost)
        ) order by r.position)
        from loyalty_rewards r where r.business_id = b.id
      ), '[]'::jsonb),

      /* ── the last twenty things that happened at the till ──
         Masked to the last three digits: enough to match a row to the person on
         the phone, not enough to be a customer list. See the header. */
      'ledger', coalesce((
        select jsonb_agg(e order by e->>'at' desc) from (
          select jsonb_build_object(
            'at',     l.created_at,
            'who',    '•••' || right(l.customer_phone, 3),
            'delta',  l.delta,
            'reason', l.reason,
            'tnd',    l.amount_tnd
          ) as e
          from points_ledger l
          where l.business_id = b.id
          order by l.created_at desc
          limit 20
        ) y
      ), '[]'::jsonb),

      /* ── what the platform has said to them ── */
      'notices', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', n.id, 'kind', n.kind, 'message', n.message,
          'createdAt', n.created_at, 'expiresAt', n.expires_at, 'active', n.active
        ) order by n.created_at desc)
        from platform_notices n
        where n.business_id = b.id
      ), '[]'::jsonb),

      /* ── what they have paid, and what we decided ── */
      'renewals', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'offer', r.offer, 'months', r.months, 'amount', r.amount,
          'method', r.method, 'status', r.status, 'note', r.note,
          'createdAt', r.created_at, 'decidedAt', r.decided_at, 'decidedNote', r.decided_note
        ) order by r.created_at desc)
        from renewal_requests r
        where r.business_id = b.id
      ), '[]'::jsonb),

      /* ── and what WE did to them ──
         The half of the record the console never showed. "Who suspended this
         shop, and when?" has always been answerable in the database and never
         on a screen. */
      'audit', coalesce((
        select jsonb_agg(e order by e->>'at' desc) from (
          select jsonb_build_object(
            'at', a.created_at, 'actor', a.actor_email,
            'action', a.action, 'detail', a.detail
          ) as e
          from admin_audit a
          where a.business_id = b.id
          order by a.created_at desc
          limit 30
        ) z
      ), '[]'::jsonb)
    )
    from businesses b
    left join profiles p on p.id = b.owner_id
    where b.id = p_id
  ) end;
$$;

/**
 * The journal, as a page rather than a folded drawer of twelve.
 *
 * Two things the old read could not do: page past the most recent handful, and
 * narrow to one shop. Both are the same question — "what has been done here?" —
 * asked at two scopes, so it is one function with an optional filter rather
 * than a second RPC that would drift out of step with the first.
 */
create or replace function admin_audit_log(
  p_actor       uuid,
  p_business_id uuid default null,
  p_limit       integer default 100,
  p_offset      integer default 0
) returns table (
  at timestamptz, actor text, action text, business_id uuid, cafe text, detail jsonb
)
language sql security definer set search_path = public as $$
  select a.created_at, a.actor_email, a.action, a.business_id, b.name, a.detail
    from admin_audit a
    left join businesses b on b.id = a.business_id
   where is_super(p_actor)
     and (p_business_id is null or a.business_id = p_business_id)
   order by a.created_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
$$;

/**
 * The badge counts on the navigation, and nothing else.
 *
 * Every page in the console renders the nav, and the nav says how much work is
 * waiting in each section. Deriving that from the existing reads would mean
 * every page loading every café, every renewal and every lead in order to draw
 * six numbers in a sidebar — the traffic page would be the slowest page in the
 * console and none of it would be about traffic.
 *
 * So: six counts, one round trip, no rows. This is what makes the nav honest
 * enough to be worth looking at — an operator should be able to tell from the
 * chrome whether to open a page at all.
 */
create or replace function admin_counts(p_actor uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select case when not is_super(p_actor) then jsonb_build_object('ok', false)
  else jsonb_build_object(
    'ok', true,
    'cafes',      (select count(*) from businesses),
    /* the alert queue: dark now, or about to be */
    'alerts',     (select count(*) from businesses b
                    where b.suspended_at is not null
                       or (b.plan_expires_at is not null
                           and b.plan_expires_at < now() + interval '7 days')),
    'renewals',   (select count(*) from renewal_requests where status = 'pending'),
    'leads',      (select count(*) from early_access_requests where status = 'new'),
    'notices',    (select count(*) from platform_notices
                    where active and (expires_at is null or expires_at > now())),
    'visits7d',   (select count(*) from visits where first_seen > now() - interval '7 days')
  ) end;
$$;

do $$
declare fn text; fns text[] := array[
  'admin_cafe_detail(uuid, uuid)',
  'admin_audit_log(uuid, uuid, integer, integer)',
  'admin_counts(uuid)'
];
begin
  foreach fn in array fns loop
    -- `public` first and by name. See 0036 for why the word matters.
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

do $$
declare leaked text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into leaked
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('admin_cafe_detail', 'admin_audit_log', 'admin_counts')
    and (has_function_privilege('public', p.oid, 'execute')
      or has_function_privilege('anon',   p.oid, 'execute'));

  if leaked is not null then
    raise exception 'still EXECUTE-able by public/anon after 0040: %', leaked;
  end if;
end $$;
