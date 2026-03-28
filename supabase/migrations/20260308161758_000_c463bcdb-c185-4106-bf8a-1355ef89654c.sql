-- Add DND columns for SMS and Call to marketing_contacts
ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS optout_sms boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS optout_call boolean DEFAULT false;
