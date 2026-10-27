-- Seguito di 20281027230000. Togliendo tutto ad `anon` si sono rotte quattro vie
-- pubbliche, e la sonda lo ha detto subito:
--   public_calendar_busy_slots → permission denied for table user_roles
--   outlook_calendar_events    → permission denied for table user_roles
--   company_qr_codes           → permission denied for table profiles
--   referral_leaderboard_public→ permission denied for table referrers
--
-- Il motivo: le ESPRESSIONI delle policy girano con i diritti di chi interroga,
-- non del proprietario. La policy pubblica di `outlook_calendar_events` chiede
-- «questo utente è un titolare di calendario pubblicato?» leggendo `user_roles` e
-- `marketing_calendars`; quella di `company_qr_codes` legge `profiles` e
-- `multi_company_access`. Senza il SELECT su quelle tabelle la policy non si può
-- nemmeno valutare e la query muore, invece di non dare righe.
--
-- Qui si rimette il SELECT solo su quelle cinque. Non è un buco: la loro RLS ad
-- `anon` non dà nessuna riga — verificato con la stessa sonda prima e dopo, zero
-- righe su tutte e cinque. Serve perché le policy delle pagine pubbliche possano
-- essere valutate.

grant select on public.user_roles           to anon;
grant select on public.profiles             to anon;
grant select on public.multi_company_access to anon;
grant select on public.marketing_calendars  to anon;
grant select on public.referrers            to anon;
