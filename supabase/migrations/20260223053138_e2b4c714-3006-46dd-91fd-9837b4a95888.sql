
ALTER TABLE public.marketing_calendars
  ADD COLUMN IF NOT EXISTS base_address_line text,
  ADD COLUMN IF NOT EXISTS base_address_city text,
  ADD COLUMN IF NOT EXISTS base_address_postal_code text,
  ADD COLUMN IF NOT EXISTS base_address_province text,
  ADD COLUMN IF NOT EXISTS base_address_country text DEFAULT 'IT',
  ADD COLUMN IF NOT EXISTS base_formatted_address text,
  ADD COLUMN IF NOT EXISTS base_lat double precision,
  ADD COLUMN IF NOT EXISTS base_lng double precision,
  ADD COLUMN IF NOT EXISTS base_place_id text;
