-- 1. New columns on marketing_contacts
ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS follower_id uuid,
  ADD COLUMN IF NOT EXISTS contact_type text NOT NULL DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Italia',
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS date_of_birth date;
