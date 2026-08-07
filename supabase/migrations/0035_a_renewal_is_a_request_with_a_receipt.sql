-- ===========================================================================
-- 0035 · A RENEWAL IS A REQUEST WITH A RECEIPT ATTACHED
--
-- There is no card payment in this product and there is not going to be one
-- soon: shops here pay with D17, with Flouci, or by bank transfer, and then
-- somebody has to look at the transfer and turn the account back on. Until now
-- that conversation happened on WhatsApp — the settings screen said "écrivez-
-- nous pour renouveler" — which means the operator's evidence that a shop paid
-- was a photograph in a chat thread, attached to no shop, no amount and no date.
--
-- So the conversation becomes a row. The owner picks an offer, sees the total,
-- pays by whichever of the three they use, photographs the receipt, and sends
-- it. The console gets a queue: shop, offer, amount, method, the photograph,
-- and two buttons. Approving is what extends the plan — the operator never
-- retypes a duration, so "approved" and "paid until" cannot disagree.
--
-- ── WHY THE PHOTOGRAPH LIVES IN THE ROW ───────────────────────────────────
-- Same reasoning as the shop's cover photo (0033): a data URI in a column that
-- nothing selects by accident, served by one route that checks who is asking.
-- It is NOT in a public bucket. A payment receipt carries a name, a phone
-- number and a partial account number — an object URL that works for anyone
-- holding it would be the wrong shape for this, however unguessable.
--
-- ── WHO CAN SEE WHAT ──────────────────────────────────────────────────────
-- RLS on, no policy, all privileges revoked: exactly like `visits` (0028), the
-- table is reachable only through the service role and the definer functions
-- below. An owner writes through submit_renewal_request, which re-checks that
-- the business is theirs — the server already resolved it, and this is the
-- second lock. Everything an operator does re-checks is_super().
-- ===========================================================================

create table if not exists renewal_requests (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,

  -- what they chose: '6m' or '12m'. The months are stored beside it rather than
  -- derived on approval, so changing the price list later cannot retroactively
  -- change what an old request was for.
  offer        text not null check (offer in ('6m', '12m')),
  months       integer not null check (months between 1 and 36),
  amount       numeric(10, 3) not null check (amount >= 0),

  method       text not null check (method in ('d17', 'flouci', 'rib')),

  -- the receipt, as a downscaled WebP data URI. Never selected by the list.
  proof        text not null,

  -- an owner's own line: a transfer reference, "payé depuis le compte de ma
  -- femme", whatever the operator would otherwise have to ask for.
  note         text,

  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now(),

  decided_at   timestamptz,
  decided_by   uuid references auth.users(id) on delete set null,
  decided_note text
);

/*
  ONE PENDING REQUEST PER SHOP.

  A partial unique index, not a check: a shop may renew many times over its
  life, but two open requests are never a real situation — they are a double
  tap, or an owner who could not tell whether the first one went through. The
  form reads this and shows the pending request instead of the fields.
*/
create unique index if not exists renewal_one_pending_per_business
  on renewal_requests (business_id) where status = 'pending';

create index if not exists renewal_pending_idx
  on renewal_requests (created_at desc) where status = 'pending';

alter table renewal_requests enable row level security;
revoke all on renewal_requests from anon, authenticated;

-- ── the owner's side ──────────────────────────────────────────────────────

/**
 * Send a renewal for review.
 *
 * p_owner is the SESSION's user id, passed by the server — never a form field.
 * The business must be theirs; a request for somebody else's shop is refused
 * here even though the caller already resolved the café, because this function
 * is the only door and it should not depend on the caller being careful.
 *
 * The 700 000 character ceiling is roughly a 500 KB image. The browser
 * downscales to ~1200px WebP before this is ever called; the limit exists so a
 * hand-made request cannot put a 20 MB row in a table the console reads.
 */
create or replace function submit_renewal_request(
  p_owner       uuid,
  p_business_id uuid,
  p_offer       text,
  p_months      integer,
  p_amount      numeric,
  p_method      text,
  p_proof       text,
  p_note        text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from businesses where id = p_business_id and owner_id = p_owner
  ) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if p_offer not in ('6m', '12m') or p_method not in ('d17', 'flouci', 'rib') then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;

  if p_proof is null or length(p_proof) < 100 then
    return jsonb_build_object('ok', false, 'reason', 'no_proof');
  end if;
  if length(p_proof) > 700000 then
    return jsonb_build_object('ok', false, 'reason', 'too_big');
  end if;

  if exists (
    select 1 from renewal_requests
     where business_id = p_business_id and status = 'pending'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_pending');
  end if;

  insert into renewal_requests (business_id, offer, months, amount, method, proof, note)
  values (p_business_id, p_offer, p_months, p_amount, p_method, p_proof,
          nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

/**
 * What the owner's own screen shows: their last few requests, WITHOUT the
 * photograph. The receipt is theirs, but re-serving a 400 KB image into a
 * settings page every time they check the status is not what they asked for.
 */
create or replace function my_renewal_requests(
  p_owner       uuid,
  p_business_id uuid
) returns table (
  id uuid, offer text, months integer, amount numeric, method text,
  status text, created_at timestamptz, decided_at timestamptz, decided_note text
)
language sql security definer set search_path = public as $$
  select r.id, r.offer, r.months, r.amount, r.method,
         r.status, r.created_at, r.decided_at, r.decided_note
    from renewal_requests r
    join businesses b on b.id = r.business_id
   where r.business_id = p_business_id
     and b.owner_id = p_owner
   order by r.created_at desc
   limit 5;
$$;

-- ── the operator's side ───────────────────────────────────────────────────

/**
 * The queue. Pending first, then whatever was decided recently, so an operator
 * can see what they just did without going looking for it.
 *
 * No proof column: the list renders a <img src="/api/admin/proof/<id>">, and
 * that route asks for one row at a time. A queue of twenty receipts inlined
 * into the console's HTML would be several megabytes of base64.
 */
create or replace function admin_renewal_requests(p_actor uuid, p_limit integer default 30)
returns table (
  id uuid, business_id uuid, name text, slug text,
  plan text, plan_expires_at timestamptz,
  offer text, months integer, amount numeric, method text, note text,
  status text, created_at timestamptz, decided_at timestamptz
)
language sql security definer set search_path = public as $$
  select r.id, r.business_id, b.name, b.slug,
         b.plan, b.plan_expires_at,
         r.offer, r.months, r.amount, r.method, r.note,
         r.status, r.created_at, r.decided_at
    from renewal_requests r
    join businesses b on b.id = r.business_id
   where is_super(p_actor)
   order by (r.status = 'pending') desc, r.created_at desc
   limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

/** One receipt, for the route that serves the bytes. Super-admins only. */
create or replace function admin_renewal_proof(p_actor uuid, p_id uuid)
returns text
language sql security definer set search_path = public as $$
  select r.proof from renewal_requests r
   where r.id = p_id and is_super(p_actor);
$$;

/**
 * Approve or refuse — and on approve, EXTEND THE PLAN in the same breath.
 *
 * This is the whole point of the queue. An operator who approves a request and
 * then has to go and set the plan by hand will, one day, do the first and not
 * the second: the shop gets an email saying "c'est bon" and stays dark. The
 * months come from the request itself, so the duration cannot drift from what
 * was paid for.
 *
 * admin_set_plan does the extending (from whichever is later — today or the
 * current expiry) and writes its own audit line, so a renewal leaves the same
 * trail as any other plan change, plus this one.
 */
create or replace function admin_decide_renewal(
  p_actor   uuid,
  p_id      uuid,
  p_approve boolean,
  p_note    text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r renewal_requests%rowtype;
  v_plan jsonb;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select * into r from renewal_requests where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;
  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'already_decided');
  end if;

  update renewal_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now(),
         decided_by = p_actor,
         decided_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id;

  if p_approve then
    v_plan := admin_set_plan(p_actor, r.business_id, 'pro', r.months, 'months');
  end if;

  perform admin_log(p_actor, case when p_approve then 'renewal_approved' else 'renewal_rejected' end,
    r.business_id,
    jsonb_build_object('offer', r.offer, 'amount', r.amount, 'method', r.method));

  return jsonb_build_object('ok', true, 'plan', v_plan);
end;
$$;

revoke all on function submit_renewal_request(uuid, uuid, text, integer, numeric, text, text, text) from anon, authenticated;
revoke all on function my_renewal_requests(uuid, uuid) from anon, authenticated;
revoke all on function admin_renewal_requests(uuid, integer) from anon, authenticated;
revoke all on function admin_renewal_proof(uuid, uuid) from anon, authenticated;
revoke all on function admin_decide_renewal(uuid, uuid, boolean, text) from anon, authenticated;

comment on table renewal_requests is
  'A shop asking to be renewed, with the receipt attached. Written through '
  'submit_renewal_request, read by the console, and closed by '
  'admin_decide_renewal — which is what extends the plan.';
