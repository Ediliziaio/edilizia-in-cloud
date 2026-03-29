-- Add folder_id to email_templates
ALTER TABLE public.email_templates ADD COLUMN folder_id UUID REFERENCES public.email_folders(id) ON DELETE SET NULL;
