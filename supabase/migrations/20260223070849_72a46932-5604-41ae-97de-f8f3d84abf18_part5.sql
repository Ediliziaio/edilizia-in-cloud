-- Add folder_id to email_campaigns
ALTER TABLE public.email_campaigns ADD COLUMN folder_id UUID REFERENCES public.email_folders(id) ON DELETE SET NULL;
