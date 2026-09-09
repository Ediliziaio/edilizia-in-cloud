-- 09/09/2026 — Il REVOKE sulle singole colonne (migration precedente) non ha
-- avuto effetto: in PostgreSQL, se il ruolo ha SELECT sull'INTERA tabella, il
-- revoke di una colonna non toglie niente. Con la sola chiave pubblica si
-- continuava a leggere l'indirizzo dell'account collegato:
--   /rest/v1/marketing_calendars?select=name,external_calendar_id
--   → {"name":"Flo Prova Calendario","external_calendar_id":"f.andriciuc@…"}
--
-- La pagina di prenotazione ora legge la vista `public_booking_calendars`
-- (solo campi pubblici, solo calendari con link attivo), quindi ad anon la
-- tabella non serve più: si chiude del tutto. Gli utenti loggati continuano a
-- passare dalle policy RLS, che li tengono dentro la loro azienda.
REVOKE SELECT ON public.marketing_calendars FROM anon;
NOTIFY pgrst, 'reload schema';
