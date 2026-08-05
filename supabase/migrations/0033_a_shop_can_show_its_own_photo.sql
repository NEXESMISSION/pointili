-- ===========================================================================
-- 0033 · A SHOP CAN PUT ITS OWN PHOTOGRAPH ON THE CARD
--
-- The customer's card is the shop's colour and the shop's logo. The one thing
-- it could not be was the shop: a picture of the counter, the bread, the room.
-- A colour says "this is a brand"; a photograph says "this is the place you
-- were standing in".
--
-- WHY ITS OWN COLUMN AND NOT design_settings.
-- design_settings is jsonb read on EVERY client page (it carries loyaltyEnabled
-- and the theme), so a 60 KB data URI living in it would be dragged into every
-- card, boutique, codes and wallet render. Its own column can be — and is —
-- left out of CAFE_COLS entirely: nothing selects it except the route that
-- serves the bytes (app/api/cover), which sets an immutable cache header so a
-- browser fetches it once and never again. The HTML carries a 40-character URL
-- instead of a photograph.
--
-- The grant list is extended rather than replaced: 0021 revoked blanket UPDATE
-- on businesses on purpose, and re-granting the whole table here would quietly
-- undo it. plan, plan_expires_at, suspended_at and status stay out of an
-- owner's reach — those belong to the audited admin_* RPCs.
-- ===========================================================================

alter table businesses add column if not exists cover_url text;

comment on column businesses.cover_url is
  'Owner-uploaded banner photograph, stored as a small WebP data URI. Never '
  'selected by the app''s normal café query — served by /api/cover/[slug] with '
  'a long cache, so it costs one request per browser rather than bytes in every '
  'page. Null is the common case and means the banner falls back to colour.';

revoke update on businesses from authenticated;
grant update (name, primary_color, logo_url, cover_url, design_settings, business_type)
  on businesses to authenticated;
