-- Create employee_attachments table
CREATE TABLE public.employee_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL,
  document_type text,
  expiry_date date,
  notes text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create external_team_attachments table
CREATE TABLE public.external_team_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_team_id uuid NOT NULL REFERENCES public.external_teams(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL,
  document_type text,
  expiry_date date,
  notes text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employee_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_team_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policy for employee_attachments
CREATE POLICY "Company admins can manage their employee attachments"
ON public.employee_attachments FOR ALL
USING (
  has_role(auth.uid(), 'company_admin'::app_role) AND
  EXISTS (
    SELECT 1 FROM public.employees e 
    WHERE e.id = employee_attachments.employee_id 
    AND e.company_id = get_user_company_id(auth.uid())
  )
);

CREATE POLICY "Super admins can manage all employee attachments"
ON public.employee_attachments FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- RLS Policy for external_team_attachments
CREATE POLICY "Company admins can manage their external team attachments"
ON public.external_team_attachments FOR ALL
USING (
  has_role(auth.uid(), 'company_admin'::app_role) AND
  EXISTS (
    SELECT 1 FROM public.external_teams t 
    WHERE t.id = external_team_attachments.external_team_id 
    AND t.company_id = get_user_company_id(auth.uid())
  )
);

CREATE POLICY "Super admins can manage all external team attachments"
ON public.external_team_attachments FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Create storage bucket for personnel attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('personnel-attachments', 'personnel-attachments', true);

-- Storage policies
CREATE POLICY "Company admins can upload personnel attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'personnel-attachments' AND
  has_role(auth.uid(), 'company_admin'::app_role)
);

CREATE POLICY "Anyone can read personnel attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'personnel-attachments');

CREATE POLICY "Company admins can delete personnel attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'personnel-attachments' AND
  has_role(auth.uid(), 'company_admin'::app_role)
);