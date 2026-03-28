-- Add folder_id to automation_flows
ALTER TABLE public.automation_flows ADD COLUMN folder_id UUID REFERENCES public.automation_folders(id) ON DELETE SET NULL;
