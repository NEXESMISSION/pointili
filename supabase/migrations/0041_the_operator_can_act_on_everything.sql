-- ===========================================================================
-- 0041 · THE OPERATOR CAN ACT ON EVERYTHING THEY CAN SEE
--
-- The console can now SHOW a great deal and CHANGE almost none of it. Every
-- support request that is not "extend this plan" ends the same way: the
-- operator opens psql, or the Supabase dashboard, and edits production by hand.
-- These are the requests that actually arrive, and what each one costs today:
--
--   "un client a perdu ses points"        → the console cannot find a customer
--   "j'ai mal écrit le nom de mon café"   → UPDATE businesses …
--   "je veux changer mon adresse /slug"   → UPDATE, and hope nothing printed
--   "j'ai vendu mon commerce"             → UPDATE businesses SET owner_id
--   "mon client a oublié son code"        → the shop can reset it; we cannot
--   "pourquoi 3 points sur 12 dinars ?"   → readable since 0040, not fixable
--   "supprimez mon compte"                → DELETE FROM businesses …
--   "prolongez ces six cafés"             → six visits to six pages
--   going live with real payment details  → a code change and a deploy
--
-- Every one of those is a scenario this platform WILL meet, and a console that
-- answers none of them is a viewer with three buttons on it. So:
--
--   · a customer becomes a findable object with a page and two levers
--   · a shop's identity, its owner, its programme and its existence are editable
--   · the roster can act on many shops at once
--   · the payment coordinates move out of the source and into a settings row
--
-- ── WHAT IS DELIBERATELY *NOT* HERE ───────────────────────────────────────
-- No "log in as this owner". It is the most requested capability in tools like
-- this and the least defensible: every action taken while impersonating is
-- recorded as the OWNER's, which turns the audit log — the thing that exists so
-- there is always a record of who did what — into fiction. Everything an
-- operator needs to do to a shop is a named, attributed action instead.
--
-- ── PHONE NUMBERS, AND THE ONE PLACE THEY ARE SHOWN IN FULL ───────────────
-- 0040 masks customer numbers on a shop's page, because that page is BROWSING:
-- one shop, many customers, none of whom asked for anything. The customer page
-- added here is the opposite — a single person, looked up because they are
-- already in a conversation with us, and the operator has to be able to verify
-- who they are and call them back. The list of search results is masked; the
-- one record you deliberately opened is not.
-- ===========================================================================

/* ═══════════════════════════════════════════════════════════════════════════
   1 · THE CUSTOMER, WHO WAS INVISIBLE
   ═══════════════════════════════════════════════════════════════════════════

   `accounts.public_id` is the key for all of this rather than the phone. The
   phone is the diner's real primary key (§04) and it is exactly what should not
   travel in an address bar, a browser history or a screenshot of one. public_id
   is ten opaque characters that mean nothing outside this database.
*/

/**
 * Find a person, by whatever the operator happens to have been told.
 *
 * A support message says one of four things: a phone number (in any format a
 * human types), the four-character code the customer reads off their own card,
 * a name, or the ten-character id from a previous conversation. All four are
 * tried, so the operator never has to know WHICH kind of thing they were given.
 *
 * The number is masked in results. A search is browsing, and a query like "25"
 * would otherwise return a page of complete phone numbers.
 */
create or replace function admin_find_diners(
  p_actor uuid,
  p_q     text,
  p_limit integer default 30
) returns table (
  public_id text, code text, name text, phone_masked text,
  shops bigint, points numeric, last_seen timestamptz, created_at timestamptz
)
language sql security definer set search_path = public as $$
  with q as (
    select
      btrim(coalesce(p_q, ''))                         as raw,
      /* "25 123 456", "+216 25 123 456" and "0025123456" are the same search */
      regexp_replace(coalesce(p_q, ''), '\D', '', 'g')  as digits
  )
  select a.public_id, a.code, a.name,
         '•••' || right(a.phone, 3) as phone_masked,
         (select count(*) from diner_cafes d where d.phone = a.phone) as shops,
         (select coalesce(sum(l.delta), 0) from points_ledger l where l.customer_phone = a.phone) as points,
         (select max(l.created_at) from points_ledger l where l.customer_phone = a.phone) as last_seen,
         a.created_at
    from accounts a, q
   where is_super(p_actor)
     and q.raw <> ''
     and (
       (length(q.digits) >= 3 and a.phone like '%' || q.digits || '%')
       or upper(a.code)      = upper(q.raw)
       or upper(a.public_id) = upper(q.raw)
       or a.name ilike '%' || q.raw || '%'
     )
   order by (select max(l.created_at) from points_ledger l where l.customer_phone = a.phone) desc nulls last
   limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

/**
 * One person, everywhere they hold a card.
 *
 * The shape of the answer is the shape of the question: somebody says "my
 * points disappeared", and the operator needs to see which shops they belong
 * to, what each balance is, and what the last thirty things that happened to
 * them were — ACROSS shops, because the customer does not know which café's
 * fault it was and should not have to.
 */
create or replace function admin_diner_detail(p_actor uuid, p_public_id text)
returns jsonb
language sql security definer set search_path = public as $$
  select case when not is_super(p_actor) then jsonb_build_object('ok', false)
  else (
    select jsonb_build_object(
      'ok', true,
      'person', jsonb_build_object(
        'publicId',  a.public_id,
        'code',      a.code,
        'name',      a.name,
        /* IN FULL, and only here. See the header: this record was opened
           deliberately, about a person already talking to us. */
        'phone',     a.phone,
        'createdAt', a.created_at,
        /* Whether they are currently locked out of signing in, which is the
           answer to "je n'arrive pas à me connecter" a good half of the time. */
        'lockedFor', coalesce(pin_locked_for(a.phone), 0)
      ),
      'totals', jsonb_build_object(
        'shops',  (select count(*) from diner_cafes d where d.phone = a.phone),
        'held',   (select coalesce(sum(l.delta), 0) from points_ledger l where l.customer_phone = a.phone),
        'earned', (select coalesce(sum(l.delta), 0) from points_ledger l where l.customer_phone = a.phone and l.delta > 0),
        'spent',  (select coalesce(-sum(l.delta), 0) from points_ledger l where l.customer_phone = a.phone and l.delta < 0)
      ),
      'cards', coalesce((
        select jsonb_agg(jsonb_build_object(
          'businessId',  b.id,
          'name',        b.name,
          'slug',        b.slug,
          'live',        cafe_is_live(b.id),
          'balance',     pointili_balance(b.id, a.phone),
          'code',        d.code,
          'since',       d.first_played_at,
          'lastOpened',  d.last_opened_at
        ) order by d.first_played_at desc)
        from diner_cafes d join businesses b on b.id = d.business_id
        where d.phone = a.phone
      ), '[]'::jsonb),
      'ledger', coalesce((
        select jsonb_agg(e order by e->>'at' desc) from (
          select jsonb_build_object(
            'at', l.created_at, 'shop', b.name, 'businessId', b.id,
            'delta', l.delta, 'reason', l.reason, 'tnd', l.amount_tnd
          ) as e
          from points_ledger l
          left join businesses b on b.id = l.business_id
          where l.customer_phone = a.phone
          order by l.created_at desc
          limit 30
        ) x
      ), '[]'::jsonb)
    )
    from accounts a
    where a.public_id = upper(p_public_id)
  ) end;
$$;

/**
 * Move a customer's balance at one shop, from the console.
 *
 * ── WHY THIS DOES NOT REUSE owner_adjust_points ───────────────────────────
 * That function refuses when the café is not live, which is correct for a
 * cashier — a shop that is switched off must not keep trading. It is exactly
 * wrong here: an operator adjusts points precisely BECAUSE something went wrong,
 * and "the shop is currently offline" is the most likely reason they were
 * called. Support has to be able to act on a broken shop.
 *
 * The entry lands in points_ledger like any other, with reason 'adjust', so it
 * appears in the customer's own history and in the shop's — a correction that
 * hides itself is worse than the error it fixes (0025).
 */
create or replace function admin_adjust_points(
  p_actor       uuid,
  p_business_id uuid,
  p_public_id   text,
  p_delta       numeric,
  p_note        text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_phone text;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  /* The phone is resolved HERE from the opaque id, so it never has to travel
     through the browser to make this call. */
  select phone into v_phone from accounts where public_id = upper(p_public_id);
  if v_phone is null then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;

  if p_delta is null or p_delta = 0 then
    return jsonb_build_object('ok', false, 'reason', 'zero');
  end if;
  /* A ceiling, because a typo here mints currency. 100 000 points is far above
     any real correction and far below "somebody held a key down". */
  if abs(p_delta) > 100000 then
    return jsonb_build_object('ok', false, 'reason', 'too_big');
  end if;

  if not exists (select 1 from diner_cafes where phone = v_phone and business_id = p_business_id) then
    return jsonb_build_object('ok', false, 'reason', 'no_card');
  end if;

  insert into points_ledger (business_id, customer_phone, delta, reason)
  values (p_business_id, v_phone, round(p_delta, 2), 'adjust');

  perform admin_log(p_actor, 'points_adjust', p_business_id,
    jsonb_build_object('who', p_public_id, 'delta', p_delta, 'note', p_note));

  return jsonb_build_object('ok', true,
    'balance', pointili_balance(p_business_id, v_phone));
end;
$$;

/**
 * Give a customer a new secret code, and lift any lockout with it.
 *
 * The HASH is computed by the caller, in Node: PINs are scrypt-hashed with a
 * per-account salt (lib/auth/crypto) and Postgres has no business knowing how.
 * This function's job is to write it, clear the failed-attempt counter that is
 * probably why they wrote in, and leave a record.
 *
 * A shop can already do this for its own cardholders (caisse/actions.ts). The
 * platform could not do it at all — so a customer whose only shop had closed,
 * or who was locked out at a café they no longer visit, had no way back in.
 */
create or replace function admin_reset_pin(
  p_actor     uuid,
  p_public_id text,
  p_pin_hash  text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_phone text;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  /* Shaped like scrypt$salt$key. A short or malformed value here would lock the
     account out permanently and silently — verifyPin early-returns false on
     anything it cannot parse. */
  if p_pin_hash is null or p_pin_hash !~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_hash');
  end if;

  select phone into v_phone from accounts where public_id = upper(p_public_id);
  if v_phone is null then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;

  update accounts set pin_hash = p_pin_hash where phone = v_phone;
  perform pin_clear(v_phone);           -- the lockout is why they wrote in
  perform admin_log(p_actor, 'pin_reset', null,
    jsonb_build_object('who', p_public_id));

  return jsonb_build_object('ok', true);
end;
$$;

/* ═══════════════════════════════════════════════════════════════════════════
   2 · THE SHOP: ITS NAME, ITS ADDRESS, ITS OWNER, ITS LIFE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Edit a shop's identity.
 *
 * ── THE SLUG IS THE DANGEROUS FIELD, AND IT IS NOT A DETAIL ───────────────
 * It is printed. On stickers, on table tents, on a poster behind the counter,
 * on whatever the shop ran off at the print shop six months ago. Changing it
 * does not break the app — it silently breaks every physical object the shop
 * has already paid for, and nobody finds out until a customer scans one.
 *
 * The function cannot prevent that; only the operator can, by asking. What it
 * CAN do is make sure the change is deliberate and recorded: the old and new
 * slug both go into the audit line, so "when did this shop's address change?"
 * is answerable afterwards. The interface says the rest out loud.
 *
 * A null argument means "leave this alone", so the same function serves a
 * one-field correction and a full rewrite.
 */
create or replace function admin_update_shop(
  p_actor  uuid,
  p_id     uuid,
  p_name   text default null,
  p_slug   text default null,
  p_phone  text default null,
  p_type   text default null,
  p_color  text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b businesses%rowtype;
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select * into b from businesses where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;

  if v_name <> '' and (length(v_name) < 2 or length(v_name) > 60) then
    return jsonb_build_object('ok', false, 'reason', 'bad_name');
  end if;

  if v_slug <> '' and v_slug <> b.slug then
    if v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' then
      return jsonb_build_object('ok', false, 'reason', 'slug_invalid');
    end if;
    if slug_reserved(v_slug) then
      return jsonb_build_object('ok', false, 'reason', 'slug_reserved');
    end if;
    if exists (select 1 from businesses where slug = v_slug and id <> p_id) then
      return jsonb_build_object('ok', false, 'reason', 'slug_taken');
    end if;
  end if;

  if p_color is not null and p_color <> '' and p_color !~ '^#[0-9a-fA-F]{6}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_color');
  end if;

  update businesses set
    name          = case when v_name  <> '' then v_name else name end,
    slug          = case when v_slug  <> '' then v_slug else slug end,
    /* An empty phone is a real value — "remove the number from my card" — so it
       is distinguished from "not supplied" by the caller passing null. */
    phone         = case when p_phone is null then phone else nullif(btrim(p_phone), '') end,
    business_type = case when p_type  is null then business_type else nullif(btrim(p_type), '') end,
    primary_color = case when coalesce(p_color, '') <> '' then p_color else primary_color end
  where id = p_id;

  perform admin_log(p_actor, 'shop_edit', p_id, jsonb_strip_nulls(jsonb_build_object(
    'name', case when v_name <> '' and v_name <> b.name then b.name || ' → ' || v_name end,
    'slug', case when v_slug <> '' and v_slug <> b.slug then b.slug || ' → ' || v_slug end,
    'type', case when p_type is not null and coalesce(p_type,'') <> coalesce(b.business_type,'') then p_type end,
    'color', case when coalesce(p_color,'') <> '' and p_color <> b.primary_color then p_color end,
    'phone', case when p_phone is not null and coalesce(p_phone,'') <> coalesce(b.phone,'') then 'changé' end
  )));

  return jsonb_build_object('ok', true, 'slug', (select slug from businesses where id = p_id));
end;
$$;

/**
 * Hand a shop to a different account.
 *
 * "J'ai vendu mon commerce" and "je n'ai plus accès à cet email" are the same
 * operation, and both currently require an UPDATE by hand. By EMAIL rather than
 * by uuid, because an email is what the operator is told on the phone — and the
 * account has to exist already, so the new owner has signed up and proved they
 * hold the address before anything moves.
 *
 * Both parties go in the audit line. This is the single change most likely to
 * be disputed later.
 */
create or replace function admin_transfer_shop(
  p_actor uuid,
  p_id    uuid,
  p_email text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_new  profiles%rowtype;
  v_old  text;
  v_name text;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select p.* into v_new from profiles p where lower(p.email) = lower(btrim(p_email));
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_account');
  end if;

  select b.name, pr.email into v_name, v_old
    from businesses b left join profiles pr on pr.id = b.owner_id
   where b.id = p_id;
  if v_name is null then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;

  update businesses set owner_id = v_new.id where id = p_id;

  perform admin_log(p_actor, 'shop_transfer', p_id,
    jsonb_build_object('from', coalesce(v_old, '—'), 'to', v_new.email));

  return jsonb_build_object('ok', true, 'to', v_new.email);
end;
$$;

/**
 * Delete a shop, and everything hanging off it.
 *
 * ── THE SLUG HAS TO BE TYPED BACK ─────────────────────────────────────────
 * Not as ceremony. This is the only irreversible action in the console and it
 * takes the cards, the balances and the history of every customer that shop
 * ever served with it. A confirmation dialog protects against a stray click; it
 * does nothing about the operator who has two tabs open and is looking at the
 * wrong one. Typing the address is the only guard that requires having READ
 * which shop this is.
 *
 * The audit line is written BEFORE the delete, and admin_audit.business_id is a
 * plain uuid with no foreign key (0007) — so the record of the deletion
 * survives the thing it deleted.
 */
create or replace function admin_delete_shop(
  p_actor   uuid,
  p_id      uuid,
  p_confirm text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b businesses%rowtype;
  v_cards bigint;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select * into b from businesses where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'introuvable');
  end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(b.slug) then
    return jsonb_build_object('ok', false, 'reason', 'mismatch');
  end if;

  select count(*) into v_cards from diner_cafes where business_id = p_id;

  perform admin_log(p_actor, 'shop_delete', p_id, jsonb_build_object(
    'name', b.name, 'slug', b.slug, 'plan', b.plan, 'cards', v_cards));

  delete from businesses where id = p_id;

  return jsonb_build_object('ok', true, 'name', b.name, 'cards', v_cards);
end;
$$;

/**
 * Set a shop's loyalty programme.
 *
 * 0040 made these numbers READABLE, which answered "why did my client only get
 * 3 points?" and left the operator unable to do anything about it. A shop whose
 * welcome bonus or stamp card is wrong cannot always find the screen that fixes
 * it, and talking somebody through their own settings while their till is wrong
 * is not support.
 *
 * ── THE RATE IS NOT IN HERE, AND THAT IS THE POINT ────────────────────────
 *
 * The first version of this function took a p_rate and the database refused it:
 * 0031 pinned points_per_tnd to exactly 1 with a CHECK constraint, and said why
 * in its own comment — "the rate is no longer an owner setting, so the column is
 * no longer theirs to move… this makes it true of the database rather than true
 * of one screen that happens not to offer the field any more."
 *
 * A super-admin editor for it would have been that screen, reintroduced from
 * the other side. One dinar earns one point everywhere on this platform; it is
 * printed on the landing page, said on the owner's settings screen, and it is
 * what makes a balance something a customer can check in their head. A console
 * that can quietly make it 0.5 for one café turns a platform-wide promise into
 * a per-shop surprise, and nobody at that counter would be able to explain it.
 *
 * The database was right. The field is gone.
 *
 * Bounds on the rest are the same ones the owner's own settings screen
 * enforces, restated here because this function is the door and must not depend
 * on the caller being careful.
 */
drop function if exists admin_set_program(uuid, uuid, numeric, integer, integer, boolean, integer, text);

create or replace function admin_set_program(
  p_actor        uuid,
  p_id           uuid,
  p_welcome      integer,
  p_expiry_hours integer,
  p_stamps       boolean,
  p_stamps_req   integer,
  p_stamp_reward text
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_welcome is null or p_welcome < 0 or p_welcome > 10000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_welcome');
  end if;
  if p_expiry_hours is null or p_expiry_hours < 1 or p_expiry_hours > 8760 then
    return jsonb_build_object('ok', false, 'reason', 'bad_expiry');
  end if;
  if p_stamps and (p_stamps_req is null or p_stamps_req < 2 or p_stamps_req > 50) then
    return jsonb_build_object('ok', false, 'reason', 'bad_stamps');
  end if;

  insert into loyalty_programs (business_id, active, points_per_tnd, welcome_points,
                                redeem_expiry_hours, stamps_enabled, stamps_required, stamp_reward)
  /* points_per_tnd is written as the literal 1, which is the only value the
     column's CHECK accepts — stated here so a reader of this function does not
     have to go and find out why there is no parameter for it. */
  values (p_id, true, 1, p_welcome, p_expiry_hours,
          coalesce(p_stamps, false), coalesce(p_stamps_req, 8),
          /* NOT NULL with a default (0011). nullif() here inserted a null and
             the insert failed with a constraint violation the interface
             reported as "enregistrement impossible". */
          coalesce(nullif(btrim(coalesce(p_stamp_reward, '')), ''), 'Une récompense offerte'))
  on conflict (business_id) do update set
    welcome_points      = excluded.welcome_points,
    redeem_expiry_hours = excluded.redeem_expiry_hours,
    stamps_enabled      = excluded.stamps_enabled,
    stamps_required     = excluded.stamps_required,
    stamp_reward        = excluded.stamp_reward;

  perform admin_log(p_actor, 'program_edit', p_id, jsonb_build_object(
    'welcome', p_welcome, 'expiry', p_expiry_hours, 'stamps', p_stamps));

  return jsonb_build_object('ok', true);
end;
$$;

/* ═══════════════════════════════════════════════════════════════════════════
   3 · MANY SHOPS AT ONCE
   ═══════════════════════════════════════════════════════════════════════════

   "Everyone whose trial ends this week gets another fortnight" and "tell the
   twelve cafés in Sfax about Sunday's maintenance" are one decision each and
   twelve page visits each. Both loop the EXISTING single-shop functions rather
   than reimplementing them — a bulk path that writes its own UPDATE is a bulk
   path that will one day disagree with the single one about what a plan change
   means, and it would disagree silently, twelve times.
*/

create or replace function admin_bulk_plan(
  p_actor  uuid,
  p_ids    uuid[],
  p_plan   text,
  p_amount integer,
  p_unit   text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_done int := 0;
  v_fail int := 0;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;
  /* A ceiling, so a mis-click that selects everything is still a decision about
     a knowable number of shops. */
  if array_length(p_ids, 1) > 100 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  foreach v_id in array p_ids loop
    if (admin_set_plan(p_actor, v_id, p_plan, p_amount, p_unit)->>'ok')::boolean then
      v_done := v_done + 1;
    else
      v_fail := v_fail + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'done', v_done, 'failed', v_fail);
end;
$$;

create or replace function admin_bulk_notice(
  p_actor   uuid,
  p_ids     uuid[],
  p_kind    text,
  p_message text,
  p_days    integer default 14
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_done int := 0;
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;
  if array_length(p_ids, 1) > 100 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  foreach v_id in array p_ids loop
    if (admin_notice(p_actor, v_id, p_kind, p_message, p_days)->>'ok')::boolean then
      v_done := v_done + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'done', v_done);
end;
$$;

/* ═══════════════════════════════════════════════════════════════════════════
   4 · THE PLATFORM'S OWN SETTINGS
   ═══════════════════════════════════════════════════════════════════════════

   lib/billing.ts carries the prices and the three sets of payment coordinates
   as constants, behind a flag that says, in its own comment:

       "To go live: put the real values below and set PLACEHOLDER to false."

   Which means the act of starting to take money is a source change, a build and
   a deploy — and until that happens the renewal screen shows a RIB of all
   zeroes with a warning banner over it. Every one of those numbers is
   operational data that changes when a bank account does; none of it is code.

   One row, because there is one platform. The `id boolean primary key check
   (id)` idiom is the standard way to say so in Postgres: the table cannot hold
   a second row, so no screen ever has to choose between them.
*/

create table if not exists platform_settings (
  id            boolean primary key default true check (id),

  /* false → the renewal screen says the coordinates are placeholders, loudly.
     This is the switch lib/billing's PLACEHOLDER used to be. */
  payments_live boolean not null default false,

  /* [{id,label,months,price,perMonth,best}] and
     [{id,label,how,lines:[{label,value}]}] — validated in TypeScript before
     they get here (see lib/settings.ts), because the shape belongs to the
     screens that render it and a check constraint in SQL would be a second,
     drifting copy of that knowledge. What SQL insists on is that they are
     arrays, so a malformed write cannot make the renewal page throw. */
  offers        jsonb not null default '[]'::jsonb check (jsonb_typeof(offers)  = 'array'),
  methods       jsonb not null default '[]'::jsonb check (jsonb_typeof(methods) = 'array'),

  /* Where a shop owner is told to write when they need a human. */
  support_phone text,
  support_email text,

  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);

alter table platform_settings enable row level security;
revoke all on platform_settings from public, anon, authenticated;

insert into platform_settings (id) values (true) on conflict (id) do nothing;

/**
 * Read the settings.
 *
 * NOT super-admin gated, and that is deliberate: the renewal screen an OWNER
 * sees has to render the payment coordinates, and the landing page has to print
 * the prices. Nothing in this row is secret — it is what we ask people to pay
 * and where we ask them to send it. It is reachable only through the service
 * role either way (revoked below), so the gate that matters is still there.
 */
create or replace function platform_settings_read()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'paymentsLive', s.payments_live,
    'offers',       s.offers,
    'methods',      s.methods,
    'supportPhone', s.support_phone,
    'supportEmail', s.support_email,
    'updatedAt',    s.updated_at
  ) from platform_settings s where s.id;
$$;

/** Write them. Super-admin only, and every save is audited. */
create or replace function admin_save_settings(
  p_actor   uuid,
  p_live    boolean,
  p_offers  jsonb,
  p_methods jsonb,
  p_phone   text default null,
  p_email   text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_super(p_actor) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if jsonb_typeof(p_offers) <> 'array' or jsonb_typeof(p_methods) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_shape');
  end if;
  /* Going live with an empty method list would leave an owner on a payment
     screen with nowhere to send the money and no explanation. */
  if coalesce(p_live, false) and jsonb_array_length(p_methods) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_methods');
  end if;

  update platform_settings set
    payments_live = coalesce(p_live, false),
    offers        = p_offers,
    methods       = p_methods,
    support_phone = nullif(btrim(coalesce(p_phone, '')), ''),
    support_email = nullif(btrim(coalesce(p_email, '')), ''),
    updated_at    = now(),
    updated_by    = p_actor
  where id;

  perform admin_log(p_actor, 'settings', null, jsonb_build_object(
    'live', coalesce(p_live, false),
    'offers', jsonb_array_length(p_offers),
    'methods', jsonb_array_length(p_methods)));

  return jsonb_build_object('ok', true);
end;
$$;

-- ===========================================================================
-- CLOSE THE DOOR. 0036 runs before this file, so these arrive EXECUTE-to-PUBLIC
-- and nothing would take it away. `public` first and by name.
-- ===========================================================================

do $$
declare fn text; fns text[] := array[
  'admin_find_diners(uuid, text, integer)',
  'admin_diner_detail(uuid, text)',
  'admin_adjust_points(uuid, uuid, text, numeric, text)',
  'admin_reset_pin(uuid, text, text)',
  'admin_update_shop(uuid, uuid, text, text, text, text, text)',
  'admin_transfer_shop(uuid, uuid, text)',
  'admin_delete_shop(uuid, uuid, text)',
  'admin_set_program(uuid, uuid, integer, integer, boolean, integer, text)',
  'admin_bulk_plan(uuid, uuid[], text, integer, text)',
  'admin_bulk_notice(uuid, uuid[], text, text, integer)',
  'platform_settings_read()',
  'admin_save_settings(uuid, boolean, jsonb, jsonb, text, text)'
];
begin
  foreach fn in array fns loop
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
    and p.proname in ('admin_find_diners', 'admin_diner_detail', 'admin_adjust_points',
                      'admin_reset_pin', 'admin_update_shop', 'admin_transfer_shop',
                      'admin_delete_shop', 'admin_set_program', 'admin_bulk_plan',
                      'admin_bulk_notice', 'platform_settings_read', 'admin_save_settings')
    and (has_function_privilege('public', p.oid, 'execute')
      or has_function_privilege('anon',   p.oid, 'execute'));

  if leaked is not null then
    raise exception 'still EXECUTE-able by public/anon after 0041: %', leaked;
  end if;
end $$;

/*
  Prove the two guards that would be worst to get wrong, at migration time.
  A destructive function that quietly ignores its confirmation, or an editor
  that hands out a reserved slug, both look exactly like a working one.
*/
do $$
declare r jsonb; v_id uuid;
begin
  select id into v_id from businesses limit 1;
  if v_id is null then return; end if;   -- empty database: nothing to prove

  r := admin_delete_shop('00000000-0000-0000-0000-000000000000', v_id, 'anything');
  if (r->>'ok')::boolean then
    raise exception 'admin_delete_shop accepted a non-super-admin';
  end if;

  r := admin_update_shop('00000000-0000-0000-0000-000000000000', v_id, null, 'admin');
  if (r->>'ok')::boolean then
    raise exception 'admin_update_shop accepted a non-super-admin';
  end if;
end $$;

comment on table platform_settings is
  'One row. Prices, payment coordinates and the go-live switch — the operational '
  'data that used to be constants in lib/billing.ts behind a PLACEHOLDER flag, '
  'so changing a bank account meant a deploy.';
