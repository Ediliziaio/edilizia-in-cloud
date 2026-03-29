-- Create email_folders table
CREATE TABLE public.email_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.email_folders(id) ON DELETE CASCADE,
  folder_type TEXT NOT NULL DEFAULT 'campaign',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
