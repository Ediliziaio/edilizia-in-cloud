-- Seguito di 20281027231000, dopo aver riguardato la sonda.
--
-- 1. `marketing_calendars`: dando il SELECT su tutta la tabella si è risvegliata
--    la sua policy «Public can read calendars by slug», che prima era MORTA
--    perché ad `anon` il grant non c'era: la sonda è passata da nulla a 20
--    righe con tutte le colonne. I dati in sé sono già pubblici (la vista
--    `public_booking_calendars` li mostra per scelta), ma alle policy servono
--    solo quattro campi: id, owner_id, booking_slug, is_active. Si danno quelli.
-- 2. `referral_tiers`: manca a `referral_leaderboard_public`, che senza di esso
--    risponde «permission denied» invece di non dare righe. È un catalogo di
--    livelli, non contiene dati di nessuno.

revoke all on table public.marketing_calendars from anon;
grant select (id, owner_id, booking_slug, is_active) on public.marketing_calendars to anon;

grant select on public.referral_tiers to anon;
