-- 1. Add score column to marketing_contacts
ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS score integer NOT NULL DEFAULT 0;
