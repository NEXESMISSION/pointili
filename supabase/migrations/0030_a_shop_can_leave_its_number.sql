-- ===========================================================================
-- 0030 · A shop can leave its number.
--
-- Onboarding used to ask three questions — name, trade, address — and then drop
-- the owner at the till with a card that was still mostly blank. The logo, the
-- colour and the rewards were all reachable, but only later, in Réglages, which
-- is a screen you go looking for once you already know it exists. A new owner
-- does not.
--
-- So the card is now BUILT during signup, and a phone number is part of it. It
-- is the one detail a customer looks for on a loyalty card and the one thing
-- this schema had nowhere to put.
--
-- Optional on purpose. A shop that would rather not publish a number simply
-- leaves it empty, and nothing on the card changes shape.
-- ===========================================================================

alter table businesses add column if not exists phone text;

-- Loose on purpose. Tunisian numbers get written +216 25 123 456, 25 123 456,
-- 25123456 and (+216) 25-123-456 by four different owners on the same street,
-- and rejecting any of those spellings would be inventing a rule the shop does
-- not have. It is a label printed on a card, not an identifier we dial or
-- match on — diner identity is accounts.phone, which IS normalised, elsewhere.
-- The only thing worth refusing is something too long to be a phone number.
do $$ begin
  alter table businesses add constraint businesses_phone_len_check
    check (phone is null or length(btrim(phone)) between 6 and 24);
exception when duplicate_object then null; end $$;
