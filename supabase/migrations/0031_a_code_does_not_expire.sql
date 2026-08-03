-- ===========================================================================
-- 0031 · A code does not expire, and a dinar is always a point.
--
-- Two settings leave the product. Both were choices nobody wanted to make.
--
-- ── 1 · codes stop having a deadline ──────────────────────────────────────
-- A customer earned the reward. Handing them a code that dies in 48 hours
-- turns a thank-you into a chore, and the shop into the one who took it back.
-- Worse, the clock ran while the shop was closed.
--
-- Every read path ALREADY accepts a null expiry as "valid forever" — see
-- 0004_auth.sql:76,86,119,126, 0007_platform.sql:55,327 and 0010:63, which all
-- read `(expires_at is null or expires_at > now())`. So nothing about
-- validation changes. Only the writing stops.
--
-- WHY A TRIGGER AND NOT THREE REWRITTEN FUNCTIONS. Three RPCs mint codes:
-- redeem_at_counter (0029), spin_wheel (0029) and add_stamp (0015). Copying
-- two of them into this file to change one word would fork long function
-- bodies that are already correct, and the next person to fix a bug in the
-- original would fix it in the dead copy. The rule "a code does not expire" is
-- one rule; it lives in one place, on the three tables that hold codes.
--
-- ── 2 · one dinar is one point, for everyone ──────────────────────────────
-- points_per_tnd was an owner setting. It should never have been: it is the
-- one number a customer must be able to carry between shops without doing
-- arithmetic, and a card that means something different at every counter is
-- not a loyalty scheme, it is a currency exchange. 0027 already made the
-- DEFAULT 1. This makes it the value.
-- ===========================================================================

-- ── the codes that already have a deadline lose it ────────────────────────
-- Only the pending ones. A code already marked claimed/expired/cancelled is
-- history, and rewriting history is exactly what this product refuses to do.
update loyalty_redemptions set expires_at = null where status = 'pending' and expires_at is not null;
update wins              set expires_at = null where status = 'pending' and expires_at is not null;
update stamp_rewards     set expires_at = null where status = 'pending' and expires_at is not null;

-- ── and no new one gets one ───────────────────────────────────────────────
create or replace function pointili_codes_never_expire()
returns trigger language plpgsql as $$
begin
  new.expires_at := null;
  return new;
end $$;

drop trigger if exists loyalty_redemptions_no_expiry on loyalty_redemptions;
create trigger loyalty_redemptions_no_expiry
  before insert or update of expires_at on loyalty_redemptions
  for each row execute function pointili_codes_never_expire();

drop trigger if exists wins_no_expiry on wins;
create trigger wins_no_expiry
  before insert or update of expires_at on wins
  for each row execute function pointili_codes_never_expire();

drop trigger if exists stamp_rewards_no_expiry on stamp_rewards;
create trigger stamp_rewards_no_expiry
  before insert or update of expires_at on stamp_rewards
  for each row execute function pointili_codes_never_expire();

-- ── one dinar, one point ──────────────────────────────────────────────────
update loyalty_programs set points_per_tnd = 1 where points_per_tnd is distinct from 1;
alter table loyalty_programs alter column points_per_tnd set default 1;

-- The rate is no longer an owner setting, so the column is no longer theirs to
-- move. A CHECK is the honest way to say that: the setting is gone from the UI
-- either way, but this makes it true of the database rather than true of one
-- screen that happens not to offer the field any more.
do $$ begin
  alter table loyalty_programs add constraint loyalty_programs_rate_is_one_check
    check (points_per_tnd = 1);
exception when duplicate_object then null; end $$;

-- redeem_expiry_hours stays as a column. Nothing reads it now, and dropping it
-- would break every RPC that still selects loyalty_programs%rowtype until each
-- one is rewritten — a lot of churn to remove a value that is simply ignored.
