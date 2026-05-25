-- Calendar video meeting defaults and appointment meeting metadata.
-- Keeps existing appointments unchanged while allowing Google Meet links
-- to be generated through the Google Calendar sync flow.

ALTER TABLE public.marketing_calendars
  ADD COLUMN IF NOT EXISTS default_meeting_provider text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS default_meeting_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS meeting_provider text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS meeting_url text,
  ADD COLUMN IF NOT EXISTS meeting_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS meeting_created_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'marketing_calendars_default_meeting_provider_check'
  ) THEN
    ALTER TABLE public.marketing_calendars
      ADD CONSTRAINT marketing_calendars_default_meeting_provider_check
      CHECK (default_meeting_provider IN ('none', 'google_meet'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_meeting_provider_check'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_meeting_provider_check
      CHECK (meeting_provider IN ('none', 'google_meet', 'manual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_meeting_status_check'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_meeting_status_check
      CHECK (meeting_status IN ('none', 'pending', 'ready', 'error'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_meeting_provider
  ON public.appointments(company_id, meeting_provider)
  WHERE meeting_provider <> 'none';
