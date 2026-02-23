
ALTER TABLE public.marketing_calendars
  ADD COLUMN base_address_line text,
  ADD COLUMN base_address_city text,
  ADD COLUMN base_address_postal_code text,
  ADD COLUMN base_address_province text,
  ADD COLUMN base_address_country text DEFAULT 'IT',
  ADD COLUMN base_formatted_address text,
  ADD COLUMN base_lat double precision,
  ADD COLUMN base_lng double precision,
  ADD COLUMN base_place_id text;
