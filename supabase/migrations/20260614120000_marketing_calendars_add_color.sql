-- Colore personalizzabile per calendario marketing (token da palette fissa,
-- es. "blue", "green", "purple"...). NULL = colore automatico per indice.
ALTER TABLE public.marketing_calendars
  ADD COLUMN IF NOT EXISTS color text;

COMMENT ON COLUMN public.marketing_calendars.color IS
  'Token colore da palette fissa (blue/green/purple/orange/pink/cyan/red/amber/teal/indigo). NULL = colore automatico per indice.';
