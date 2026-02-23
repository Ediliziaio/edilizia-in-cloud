
-- Create email_folders table
CREATE TABLE public.email_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.email_folders(id) ON DELETE CASCADE,
  folder_type TEXT NOT NULL DEFAULT 'campaign',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_folders ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Company admins can manage their email folders"
  ON public.email_folders FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view email folders if permitted"
  ON public.email_folders FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_marketing'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all email folders"
  ON public.email_folders FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Add folder_id to email_campaigns
ALTER TABLE public.email_campaigns ADD COLUMN folder_id UUID REFERENCES public.email_folders(id) ON DELETE SET NULL;

-- Add folder_id to email_templates
ALTER TABLE public.email_templates ADD COLUMN folder_id UUID REFERENCES public.email_folders(id) ON DELETE SET NULL;
