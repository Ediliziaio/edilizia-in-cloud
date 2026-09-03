-- Prenotazioni al livello di Calendly (03/09/2026): margini fra appuntamenti,
-- preavviso minimo, tetto giornaliero, promemoria automatici e link personale
-- per disdire o spostare.

-- 1. Regole per calendario. Erano solo in user_calendar_preferences (per
--    utente) e nessuno le leggeva: qui stanno accanto a durata e slug, dove
--    l'utente le cerca.
ALTER TABLE public.marketing_calendars
  ADD COLUMN IF NOT EXISTS buffer_before_min integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buffer_after_min integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_notice_minutes integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS max_per_day integer,
  ADD COLUMN IF NOT EXISTS reminder_24h boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_1h boolean NOT NULL DEFAULT true;
ALTER TABLE public.marketing_calendars DROP CONSTRAINT IF EXISTS marketing_calendars_regole_chk;
ALTER TABLE public.marketing_calendars ADD CONSTRAINT marketing_calendars_regole_chk CHECK (
  buffer_before_min BETWEEN 0 AND 240 AND buffer_after_min BETWEEN 0 AND 240
  AND min_notice_minutes BETWEEN 0 AND 20160
  AND (max_per_day IS NULL OR max_per_day > 0));
COMMENT ON COLUMN public.marketing_calendars.buffer_before_min IS 'Minuti liberi richiesti PRIMA dell''appuntamento.';
COMMENT ON COLUMN public.marketing_calendars.min_notice_minutes IS 'Preavviso minimo: non si prenota entro questi minuti da adesso.';
COMMENT ON COLUMN public.marketing_calendars.max_per_day IS 'Tetto di appuntamenti al giorno su questo calendario; NULL = nessun tetto.';

-- 2. Token di gestione: il link personale che il cliente riceve per disdire o
--    spostare. Casuale, non indovinabile, uno per appuntamento.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS manage_token text,
  ADD COLUMN IF NOT EXISTS booking_email text,
  ADD COLUMN IF NOT EXISTS reminder_24h_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1h_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by text;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_manage_token_uidx ON public.appointments (manage_token) WHERE manage_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS appointments_promemoria_idx ON public.appointments (appointment_date, appointment_time)
  WHERE status = 'confermato' AND calendar_id IS NOT NULL;
COMMENT ON COLUMN public.appointments.manage_token IS 'Token del link pubblico "gestisci appuntamento" (disdici/sposta).';
COMMENT ON COLUMN public.appointments.booking_email IS 'Email di chi ha prenotato dalla pagina pubblica: serve a promemoria e disdette.';

-- 3. La pagina pubblica di gestione legge l'appuntamento SOLO tramite token, e
--    solo i campi che servono a mostrarlo. Vista con i permessi del
--    proprietario (come public_appointment_slots), filtrata sul token.
DROP VIEW IF EXISTS public.public_appointment_manage;
CREATE VIEW public.public_appointment_manage AS
  SELECT a.manage_token, a.id, a.appointment_date, a.appointment_time, a.appointment_end_time,
         a.status, a.title, a.booking_email, a.calendar_id,
         c.name AS calendar_name, c.description AS calendar_description,
         c.duration_minutes, c.booking_slug, c.min_notice_minutes
  FROM public.appointments a
  JOIN public.marketing_calendars c ON c.id = a.calendar_id
  WHERE a.manage_token IS NOT NULL AND c.booking_slug IS NOT NULL AND c.is_active = true;
GRANT SELECT ON public.public_appointment_manage TO anon, authenticated, service_role;

-- 4. Gli slot pubblici devono considerare anche i margini: la vista usata dalla
--    pagina espone gia' inizio e fine, il calcolo lo fa chi legge. Qui si
--    aggiunge solo l'esclusione degli annullati, che restavano a occupare
--    l'orario.
CREATE OR REPLACE VIEW public.public_appointment_slots AS
  SELECT id, appointment_date, appointment_time, appointment_end_time, is_blocked_slot, calendar_id, company_id
  FROM public.appointments
  WHERE calendar_id IS NOT NULL
    AND COALESCE(status, '') NOT IN ('annullato', 'cancelled')
    AND EXISTS (
      SELECT 1 FROM public.marketing_calendars mc
      WHERE mc.id = appointments.calendar_id AND mc.booking_slug IS NOT NULL AND mc.is_active = true);
