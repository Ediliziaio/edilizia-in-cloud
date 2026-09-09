-- 09/09/2026 — URGENTE. Le viste dello schema public nascono con i privilegi
-- di default di Supabase: GRANT ALL a anon e authenticated. Su una vista
-- semplice (SELECT da una tabella + WHERE) Postgres le rende auto-updatable, e
-- la vista gira con i privilegi del suo proprietario: quindi con la sola
-- chiave pubblica si poteva SCRIVERE nella tabella sottostante passando dalla
-- vista. Verificato sul vivo su `public_booking_calendars` (creata un'ora fa):
--   PATCH /rest/v1/public_booking_calendars?booking_slug=eq.…
--   → 200, descrizione del calendario cambiata da un anonimo.
--
-- Qui si chiudono le viste del modulo prenotazioni: sono fatte per essere
-- LETTE da chi non ha un account, non per essere scritte. Chi deve scrivere
-- (le edge function public-booking-*) passa dalla service role.
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'public_booking_calendars',
    'public_appointment_slots',
    'public_appointment_manage',
    'public_calendar_busy_slots',
    'public_calendar_owner_prefs',
    'unified_calendar_busy_slots',
    'outlook_calendar_busy_slots',
    'google_calendar_busy_slots',
    'apple_calendar_busy_slots'
  ] LOOP
    IF to_regclass('public.' || v) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v);
      EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', v);
    END IF;
  END LOOP;
END $$;

-- La lettura anonima di marketing_calendars serve ANCORA, ma solo dentro le
-- policy: quella delle fasce orarie fa EXISTS su questa tabella, e senza il
-- privilegio la policy fallisce con 42501 — cioè la pagina /prenota muore per
-- tutti (successo poco fa, in produzione, per una decina di minuti).
-- Si concedono le colonne pubbliche, non quelle dell'aggancio: external_* resta
-- fuori, ed è il motivo per cui la lettura era stata chiusa.
GRANT SELECT (
  id, company_id, owner_id, name, description, color, calendar_type,
  booking_slug, is_active, duration_minutes,
  default_meeting_provider, default_meeting_enabled,
  buffer_before_min, buffer_after_min, min_notice_minutes, max_per_day
) ON public.marketing_calendars TO anon;

-- Le fasce di un calendario pubblico si leggono anche con una sessione aperta:
-- la policy valeva solo per `anon`, e chi era loggato vedeva «questo calendario
-- non ha ancora giorni e orari pubblicati». L'EXISTS passa dalla vista, che
-- authenticated può leggere anche per calendari di altre aziende.
DROP POLICY IF EXISTS "Public can read availability for active calendars" ON public.marketing_calendar_availability;
CREATE POLICY "Public can read availability for active calendars"
ON public.marketing_calendar_availability
FOR SELECT TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM public.public_booking_calendars v
   WHERE v.id = marketing_calendar_availability.calendar_id
));

NOTIFY pgrst, 'reload schema';
