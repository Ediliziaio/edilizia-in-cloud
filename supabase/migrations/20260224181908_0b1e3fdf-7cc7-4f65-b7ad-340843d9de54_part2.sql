-- companies: coordinate sede operativa (fallback per base)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS operational_lat double precision,
  ADD COLUMN IF NOT EXISTS operational_lng double precision;
