-- 09/09/2026 — Due guasti sulla stessa tabella, trovati provando a mettere il
-- calendario nella pagina «grazie» del sito.
--
-- 1. Un utente LOGGATO non vedeva i calendari pubblici altrui: la policy
--    «Public can read calendars by slug» vale solo per il ruolo `anon`, e le
--    altre chiedono di appartenere all'azienda. Chi aveva la sessione aperta
--    (cioè quasi tutti i nostri utenti, e chiunque avesse fatto login una
--    volta) apriva un link /prenota e leggeva «Calendario non trovato».
-- 2. Le colonne dell'aggancio aggiunte ieri (external_provider,
--    external_connection_id, external_calendar_id, external_calendar_name)
--    erano leggibili da ANONIMO insieme al resto della riga: con la sola
--    chiave pubblica si otteneva l'indirizzo Gmail dell'account collegato di
--    ogni commerciale di ogni azienda.
--
-- Rimedio: una vista con le SOLE colonne che servono alla pagina pubblica,
-- leggibile da anonimi e da utenti loggati; e le colonne dell'aggancio non
-- più leggibili da anon sulla tabella.

CREATE OR REPLACE VIEW public.public_booking_calendars AS
SELECT
  id,
  company_id,
  owner_id,
  name,
  description,
  booking_slug,
  duration_minutes,
  default_meeting_provider,
  default_meeting_enabled,
  buffer_before_min,
  buffer_after_min,
  min_notice_minutes,
  max_per_day
FROM public.marketing_calendars
WHERE booking_slug IS NOT NULL
  AND is_active = true;

-- Niente security_invoker: la vista è la barriera. Espone solo calendari con
-- link pubblico attivo, e solo i campi che la pagina di prenotazione mostra.
GRANT SELECT ON public.public_booking_calendars TO anon, authenticated;

REVOKE SELECT (external_provider, external_connection_id, external_calendar_id, external_calendar_name)
  ON public.marketing_calendars FROM anon;

NOTIFY pgrst, 'reload schema';
