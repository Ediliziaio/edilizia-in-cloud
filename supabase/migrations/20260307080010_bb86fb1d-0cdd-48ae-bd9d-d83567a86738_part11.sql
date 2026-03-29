-- 2. Add preference columns to marketing_contacts
ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'italiano';
