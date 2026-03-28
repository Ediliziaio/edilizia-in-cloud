ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS optout_email boolean DEFAULT false;
