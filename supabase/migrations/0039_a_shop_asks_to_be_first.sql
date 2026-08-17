-- ===========================================================================
-- 0039 · A SHOP ASKS TO BE FIRST
--
-- Pointili is not on the market yet, and the only thing that can be sold before
-- there is a product is a PLACE IN THE QUEUE. So there is now one public page
-- (/early) whose entire job is to turn a shop owner who just heard of us into a
-- WhatsApp number we can call — and this table is where that number lands.
--
-- ── THREE COLUMNS OF ANSWER, AND NOT ONE MORE ─────────────────────────────
-- Who are they (name), what are they (type), how do we reach them (phone).
-- Everything else — the city, the Instagram, the number of covers, the reason
-- they are interested — is a question we can ask on the phone call this row
-- exists to produce, and every one of them asked HERE is a chance to close the
-- tab instead. The form is three fields because three fields is what gets
-- filled in.
--
-- `want` is the one optional answer, and the ordering is the whole trick: it is
-- asked AFTER the row already exists, on the thank-you screen. It cannot cost
-- us a lead because the lead is already saved when the question appears.
--
-- ── WHATSAPP IS THE KEY, LITERALLY ────────────────────────────────────────
-- One row per phone number, enforced by a unique index, because the phone is
-- the CONVERSATION: an operator opens wa.me/216… and there is one thread with
-- that shop. A second submission from the same number is a double tap — an
-- owner who could not tell whether the first one went through — so it updates
-- the row it already has and leaves the pipeline status alone. That does mean
-- an owner submitting a SECOND business from the same number overwrites the
-- first name; it is the right trade for a pre-launch list, and the operator is
-- on a call with them either way.
--
-- ── THE PIPELINE IS FOUR WORDS ────────────────────────────────────────────
-- new → contacted → demo → client, plus `lost`. That is the funnel the console
-- shows, and it is deliberately not a CRM: no owners, no assignments, no
-- reminders, no stages that need explaining. One person is working this list.
--
-- ── WHO CAN SEE WHAT ──────────────────────────────────────────────────────
-- Same shape as `visits` (0028) and `renewal_requests` (0035): RLS on, NO
-- policy, all privileges revoked. The table is reachable only through the
-- service role and the definer functions below. That matters more here than
-- usual — this is a list of Tunisian business owners' phone numbers, which is
-- exactly the kind of table that must never be one missing policy away from
-- being a scrapeable lead list for somebody else.
--
-- ── WHAT THIS DOES NOT DEFEND AGAINST, SAID OUT LOUD ──────────────────────
-- The submit function is reachable by anyone who can load the page — that is
-- what a public form is. Against it: the phone must normalise to +digits, the
-- lengths are capped, one row per number, and the form carries a honeypot field
-- that ordinary bots fill in. Against a determined person with a script and ten
-- thousand invented numbers: nothing here. A global burst cap was considered and
-- REJECTED, because it hands that same person a way to shut the form for real
-- shops, which is strictly worse than junk rows an operator can delete — and
-- admin_delete_early exists so they can.
-- ===========================================================================

create table if not exists early_access_requests (
  id            uuid primary key default gen_random_uuid(),

  -- what they typed. Not a slug, not validated against anything: at this stage
  -- "Café XYZ" is a name in somebody's head, not a tenant.
  business_name text not null check (length(btrim(business_name)) between 2 and 80),

  -- a key from BUSINESS_TYPES in lib/businessTypes.ts, so the day a lead becomes
  -- a real shop the category carries over instead of being asked twice. The
  -- form offers five of them; the column accepts any, which is what keeps this
  -- from breaking when the picker grows.
  business_type text not null check (length(business_type) between 2 and 40),

  -- E.164, normalised by the server before it ever gets here (+21625123456).
  phone         text not null check (phone ~ '^\+\d{8,15}$'),

  -- the ONE optional question, answered after the row exists. Null is the
  -- honest and common case and must never be read as "they had no opinion" —
  -- it means they closed the tab on the thank-you screen, which is fine.
  want          text check (want in ('retour', 'systeme', 'connaitre', 'curieux')),

  -- how they arrived: 'direct', 'tag' (a customer tagged their business and the
  -- page said so), or a campaign tag. This is what makes the list answer
  -- "which post actually produced shops", which is the question the whole
  -- pre-launch content plan is betting on.
  source        text,

  -- the pipeline. `new` is a lead nobody has opened WhatsApp for yet.
  status        text not null default 'new'
                  check (status in ('new', 'contacted', 'demo', 'client', 'lost')),

  -- the operator's own line: "rappeler après 17h", "gérant pas décideur".
  note          text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  handled_at    timestamptz,
  handled_by    uuid references auth.users(id) on delete set null
);

/*
  ONE LEAD PER NUMBER. See the header: the phone is the conversation, and two
  rows for one WhatsApp thread is a way to call somebody twice.
*/
create unique index if not exists early_one_per_phone
  on early_access_requests (phone);

/* The console opens on the untouched ones, so that read gets the index. */
create index if not exists early_new_idx
  on early_access_requests (created_at desc) where status = 'new';

alter table early_access_requests enable row level security;
revoke all on early_access_requests from public, anon, authenticated;

-- ── the shop's side ───────────────────────────────────────────────────────

/**
 * Take a lead.
 *
 * Returns the id so the caller can hand it to answer_early_access — but see
 * app/early/actions.ts: that id is put in an httpOnly cookie and never reaches
 * the browser, so nobody can post an answer against a stranger's row.
 *
 * A repeat from the same number REFRESHES the details and leaves `status`,
 * `note`, `handled_at` and `created_at` where they are. An operator who has
 * already spoken to this shop must not find them back at the top of the "never
 * contacted" queue because the owner tapped the button again.
 *
 * `want` is only overwritten when the new one is non-null, so re-submitting the
 * form cannot erase an answer they gave the first time round.
 */
create or replace function submit_early_access(
  p_business_name text,
  p_business_type text,
  p_phone         text,
  p_source        text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_name text := btrim(coalesce(p_business_name, ''));
  v_type text := btrim(coalesce(p_business_type, ''));
begin
  if length(v_name) < 2 or length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'bad_name');
  end if;
  if length(v_type) < 2 or length(v_type) > 40 then
    return jsonb_build_object('ok', false, 'reason', 'bad_type');
  end if;
  if p_phone is null or p_phone !~ '^\+\d{8,15}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_phone');
  end if;

  insert into early_access_requests (business_name, business_type, phone, source)
  values (v_name, v_type, p_phone, left(nullif(btrim(coalesce(p_source, '')), ''), 60))
  on conflict (phone) do update
    set business_name = excluded.business_name,
        business_type = excluded.business_type,
        source        = coalesce(excluded.source, early_access_requests.source),
        updated_at    = now()
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

/**
 * The one optional question, answered on the thank-you screen.
 *
 * Bounded three ways, because the id travels through a cookie and a cookie is
 * something a person holds: the row must exist, must not already have an answer,
 * and must be less than a day old. The worst a stolen id can do is set a field
 * that was empty, once, on a row that is already ours.
 */
create or replace function answer_early_access(p_id uuid, p_want text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hit int;
begin
  if p_want not in ('retour', 'systeme', 'connaitre', 'curieux') then
    return jsonb_build_object('ok', false, 'reason', 'bad_want');
  end if;

  update early_access_requests
     set want = p_want, updated_at = now()
   where id = p_id
     and want is null
     and created_at > now() - interval '1 day';

  get diagnostics v_hit = row_count;
  return jsonb_build_object('ok', v_hit > 0);
end;
$$;

-- ── the operator's side ───────────────────────────────────────────────────

/**
 * The list. Untouched leads first — that is the only ordering that matches what
 * the console is for — then whatever was worked on most recently.
 */
create or replace function admin_early_access(p_actor uuid, p_limit integer default 200)
returns table (
  id uuid, business_name text, business_type text, phone text,
  want text, source text, status text, note text,
  created_at timestamptz, handled_at timestamptz
)
language sql security definer set search_path = public as $$
  select e.id, e.business_name, e.business_type, e.phone,
         e.want, e.source, e.status, e.note,
         e.created_at, e.handled_at
    from early_access_requests e
   where is_super(p_actor)
   order by (e.status = 'new') desc, e.created_at desc
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

/**
 * THE NUMBER THIS WHOLE PAGE EXISTS TO PRODUCE.
 *
 * Not the lead count — the RATE. "180 shops signed up" is a number to feel good
 * about; "180 out of 1000 who opened the page" is a fact about whether the
 * pitch works, and "8 out of 1000" is the same fact saying something urgent.
 * Neither is readable without the denominator, so the denominator is computed
 * here, from `visits` (0028), rather than left for somebody to look up in
 * another panel and divide in their head.
 *
 * The visit count is sessions whose ENTRY path was the page — not every session
 * that ever touched it — which is the same definition the traffic panel uses and
 * the only one that makes the ratio mean "of the people this page received".
 *
 * `by_type` is the other half: knowing the list is 60% cafés before a single
 * café has been sold is worth more than knowing it is 180 long.
 */
create or replace function admin_early_access_stats(p_actor uuid, p_days integer default 30)
returns jsonb
language sql security definer set search_path = public as $$
  select case when not is_super(p_actor) then jsonb_build_object('ok', false)
  else jsonb_build_object(
    'ok', true,
    'days', greatest(1, least(coalesce(p_days, 30), 365)),
    'total', (select count(*) from early_access_requests),
    'new',   (select count(*) from early_access_requests where status = 'new'),
    'clients', (select count(*) from early_access_requests where status = 'client'),
    'recent', (
      select count(*) from early_access_requests
       where created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
    ),
    'visits', (
      select count(*) from visits
       where entry_path = '/early'
         and first_seen > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
    ),
    'by_type', coalesce((
      select jsonb_agg(t) from (
        select business_type as type, count(*) as n
          from early_access_requests
         group by business_type
         order by count(*) desc, business_type
      ) t
    ), '[]'::jsonb),
    'by_want', coalesce((
      select jsonb_agg(w) from (
        select want, count(*) as n
          from early_access_requests
         where want is not null
         group by want
         order by count(*) desc
      ) w
    ), '[]'::jsonb)
  ) end;
$$;

/**
 * Move a lead along the pipeline, or leave a note on it.
 *
 * `handled_at` is stamped the first time it leaves 'new', and never re-stamped:
 * it answers "when did we first get to this shop", which is the number that
 * says whether the list is being worked or is just growing.
 */
create or replace function admin_set_early_status(
  p_actor  uuid,
  p_id     uuid,
  p_status text,
  p_note   text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hit int;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_status not in ('new', 'contacted', 'demo', 'client', 'lost') then
    return jsonb_build_object('ok', false, 'reason', 'bad_status');
  end if;

  update early_access_requests
     set status     = p_status,
         /* an empty note field must not wipe a note that is already there —
            the row's status buttons post without one every time */
         note       = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note),
         handled_at = case
                        when p_status <> 'new' and handled_at is null then now()
                        else handled_at
                      end,
         handled_by = p_actor,
         updated_at = now()
   where id = p_id;

  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;

  perform admin_log(p_actor, 'early_status', null,
    jsonb_build_object('id', p_id, 'status', p_status));

  return jsonb_build_object('ok', true);
end;
$$;

/**
 * Delete a lead outright — the junk door.
 *
 * A public form with no rate limit in front of it (see the header) will one day
 * collect rows that are somebody testing whether it works. Marking those 'lost'
 * would leave them in the counts, and the counts are the point.
 */
create or replace function admin_delete_early(p_actor uuid, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  delete from early_access_requests where id = p_id;
  perform admin_log(p_actor, 'early_delete', null, jsonb_build_object('id', p_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- ===========================================================================
-- RESERVE THE SLUG — AND STOP COPYING THE LIST.
--
-- /early is a static route, and Next.js resolves static before /[slug], so a
-- café created on that slug would be permanently unreachable and nothing would
-- say so. It has to go in the reserved list.
--
-- ── WHY THIS FILE DOES NOT JUST PASTE THE LIST A FIFTH TIME ───────────────
-- The list lives inside TWO function bodies, and adding a word to it has meant
-- re-declaring both, in full, in a new migration. 0016, 0020, 0027 and 0032
-- each did that. 0020's own header says why it is dangerous — "create_cafe
-- cannot be paraphrased… rewriting it from memory silently produced cafés that
-- never got created" — and the danger is not paraphrase, it is that the copy
-- being pasted is whichever version the author happened to open. Writing this
-- migration reproduced the exact failure: the body was taken from 0020 and
-- carried its 40/80/120/300 reward ladder, which 0027 replaced with 8/13/20/38
-- when a point became a dinar. It would have silently reverted the seeded
-- rewards for every café created afterwards, and nothing in the app would have
-- looked wrong until an owner wondered why an espresso cost forty points.
--
-- So the list becomes a FUNCTION that both guards call. create_cafe is
-- re-declared once more here — 0032's body verbatim, ladder included, with the
-- inline `in (…)` replaced by a call — and after this, reserving a route is a
-- one-line change to slug_reserved() that cannot take a reward ladder with it.
--
-- Three words go in with this move: 'early', plus 'conditions' and
-- 'confidentialite'. Those two are real routes under app/(legal) and have been
-- in RESERVED_SLUGS in lib/data.ts all along, but were never in the SQL copy —
-- which is the same divergence in its other direction, and exactly what having
-- one definition prevents.
-- ===========================================================================

/**
 * The one list. Keep in step with RESERVED_SLUGS in lib/data.ts — those two are
 * unavoidably separate (one guards the database, the other the create form
 * before it posts), but they are now two places instead of three.
 */
create or replace function slug_reserved(p_slug text)
returns boolean language sql immutable set search_path = public as $$
  select p_slug in (
    'owner','admin','api','auth','cartes','moi','early',
    'conditions','confidentialite',
    'login','signup','logout','app','static',
    '_next','favicon.ico','icon.png','apple-icon.png','robots.txt','sitemap.xml'
  );
$$;

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
  if slug_reserved(p_slug) then
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

  -- 3, 5, 8 and 15 visits at 2,50 the visit. See the header of 0032.
  insert into loyalty_rewards (business_id, label, points_cost, active, position) values
    (v_id, 'Espresso offert',     8, true, 0),
    (v_id, 'Cappuccino offert',  13, true, 1),
    (v_id, 'Pâtisserie du jour', 20, true, 2),
    (v_id, 'Brunch complet',     38, true, 3);

  return jsonb_build_object('ok', true, 'id', v_id, 'slug', p_slug);
end;
$$;

create or replace function slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'
     and not slug_reserved(p_slug)
     and not exists (select 1 from businesses where slug = p_slug);
$$;

-- ===========================================================================
-- CLOSE THE DOOR.
--
-- 0036 sweeps every security-definer function and revokes EXECUTE from PUBLIC —
-- but it runs BEFORE this file, so these seven arrive with the default
-- grant-to-PUBLIC that 0036 exists to remove and nothing would take it away.
-- Named here, with `public` first and by name, because that word is the whole
-- lesson of 0036.
-- ===========================================================================

do $$
declare fn text; fns text[] := array[
  'submit_early_access(text, text, text, text)',
  'answer_early_access(uuid, text)',
  'admin_early_access(uuid, integer)',
  'admin_early_access_stats(uuid, integer)',
  'admin_set_early_status(uuid, uuid, text, text)',
  'admin_delete_early(uuid, uuid)',
  'create_cafe(uuid, text, text, text)',
  'slug_available(text)',
  /* not security definer, so 0036's sweep would never reach it and it leaks
     nothing — it is a list of route names anybody can read off the address
     bar. Closed anyway, because "every function in this file is closed" is a
     rule that survives being skimmed and "this one is fine" is not. The two
     definer functions that call it run as their owner and are unaffected. */
  'slug_reserved(text)'
];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

/*
  Prove it, rather than trusting the loop — the same self-check 0036 and 0037
  both had to grow after a revoke that read like a lock and was a no-op.
*/
do $$
declare leaked text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into leaked
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('submit_early_access', 'answer_early_access', 'admin_early_access',
                      'admin_early_access_stats', 'admin_set_early_status', 'admin_delete_early',
                      'create_cafe', 'slug_available', 'slug_reserved')
    and (has_function_privilege('public', p.oid, 'execute')
      or has_function_privilege('anon',   p.oid, 'execute'));

  if leaked is not null then
    raise exception 'still EXECUTE-able by public/anon after 0039: %', leaked;
  end if;
end $$;

/* And prove the slug is actually reserved, in both guards. */
do $$
begin
  if slug_available('early') then
    raise exception 'slug_available() still hands out "early" — /early would shadow the shop';
  end if;
  if slug_available('conditions') or slug_available('confidentialite') then
    raise exception 'slug_available() still hands out a legal route';
  end if;
end $$;

comment on table early_access_requests is
  'A shop asking to be among the first on Pointili: name, category, WhatsApp. '
  'Written through submit_early_access from the public /early page, worked '
  'through the console. One row per phone number — the phone is the conversation.';
