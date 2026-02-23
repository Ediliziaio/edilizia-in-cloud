
-- Create automation_folders table
CREATE TABLE public.automation_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.automation_folders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.automation_folders ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own company folders" ON public.automation_folders
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert own company folders" ON public.automation_folders
  FOR INSERT WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can update own company folders" ON public.automation_folders
  FOR UPDATE USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can delete own company folders" ON public.automation_folders
  FOR DELETE USING (company_id = public.get_user_company_id(auth.uid()));

-- Add folder_id to automation_flows
ALTER TABLE public.automation_flows ADD COLUMN folder_id UUID REFERENCES public.automation_folders(id) ON DELETE SET NULL;
