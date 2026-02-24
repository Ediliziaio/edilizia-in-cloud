
-- marketing_calendars: km massimi giornalieri per calendario/commerciale
ALTER TABLE public.marketing_calendars
  ADD COLUMN IF NOT EXISTS max_daily_km integer;

-- marketing_calendar_preferences: impostazioni globali
ALTER TABLE public.marketing_calendar_preferences
  ADD COLUMN IF NOT EXISTS default_max_daily_km integer NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS max_travel_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS default_appointment_duration_minutes integer NOT NULL DEFAULT 90;

-- companies: coordinate sede operativa (fallback per base)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS operational_lat double precision,
  ADD COLUMN IF NOT EXISTS operational_lng double precision;
