-- Add folder_id to automation_flows
ALTER TABLE public.automation_flows ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.automation_folders(id) ON DELETE SET NULL;
