
-- Create marketing_documents table
CREATE TABLE public.marketing_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL,
  company_id uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketing_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Company admins can manage marketing documents"
  ON public.marketing_documents FOR ALL
  USING (has_role(auth.uid(), 'company_admin') AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view marketing documents if permitted"
  ON public.marketing_documents FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders') AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all marketing documents"
  ON public.marketing_documents FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('marketing-attachments', 'marketing-attachments', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload marketing attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'marketing-attachments');

CREATE POLICY "Authenticated users can view marketing attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'marketing-attachments');

CREATE POLICY "Authenticated users can delete marketing attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'marketing-attachments');
