-- marketing_calendar_preferences: impostazioni globali
ALTER TABLE public.marketing_calendar_preferences
  ADD COLUMN IF NOT EXISTS default_max_daily_km integer NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS max_travel_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS default_appointment_duration_minutes integer NOT NULL DEFAULT 90;
