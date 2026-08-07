-- ===========================================================================
-- 0037 · A shop is public. Its ACCOUNT is not.
--
-- `grant select on businesses to anon` had no column list, so every column was
-- world-readable with the key that ships in the browser — including four that
-- are platform state, not shop identity:
--
--   owner_id           the super-admin uuid that made 0036's exploit trivial:
--                      a super-admin owns a public shop, so their id was simply
--                      published, and every admin RPC gated on a caller-supplied
--                      p_actor accepted it.
--   plan               who is paying, and for what tier.
--   plan_expires_at    when each shop's subscription lapses — a competitor's
--                      renewal calendar, and a churn list for anyone who wants it.
--   suspended_reason   free text written by an operator ABOUT a shop, never
--                      intended for the shop's own customers, let alone the world.
--   suspended_at,
--   created_at         business intelligence about the platform's size and age.
--
-- ── why this is safe to remove ────────────────────────────────────────────
-- Nothing in the product reads this table with the anon key. Every server read
-- goes through createAdminClient() (lib/data.ts CAFE_COLS), which is service_role
-- and bypasses grants entirely. `authenticated` keeps SELECT on the presentation
-- columns because the settings writes do `.update(...).select("id")` — a write
-- that cannot read its own id back reports "Rien n'a été enregistré" (assertWrote).
--
-- The public-read RLS policy is untouched: a café page still resolves. What
-- changes is that the columns describing the shop's COMMERCIAL RELATIONSHIP with
-- us stop being part of "public".
-- ===========================================================================

-- Revoke wholesale first: a column-level grant cannot be narrowed in place, and
-- leaving the table-level grant in place would make the re-grant below cosmetic.
revoke select on businesses from anon, authenticated;

/*
  What a café page legitimately shows a stranger: who the shop is and how its
  card should look. Nothing about the account behind it.

  cover_url and logo_url are data-URIs / paths for the card art; phone is the
  SHOP's number, which the owner chose to print on their own card (0030).
*/
grant select (
  id, name, slug, status,
  primary_color, logo_url, cover_url, phone,
  business_type, design_settings
) on businesses to anon, authenticated;

/*
  Prove it. A migration that revoked nothing looks exactly like one that worked,
  and this is the second time in two files that distinction has mattered.
*/
do $$
declare leaked text;
begin
  select string_agg(column_name, ', ' order by column_name) into leaked
  from information_schema.column_privileges
  where table_name = 'businesses'
    and grantee in ('anon', 'authenticated')
    and privilege_type = 'SELECT'
    and column_name in
      ('owner_id', 'plan', 'plan_expires_at', 'suspended_at', 'suspended_reason', 'created_at');

  if leaked is not null then
    raise exception 'businesses still exposes % to anon/authenticated', leaked;
  end if;
end $$;
