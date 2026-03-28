-- marketing_calendars: km massimi giornalieri per calendario/commerciale
ALTER TABLE public.marketing_calendars
  ADD COLUMN IF NOT EXISTS max_daily_km integer;
