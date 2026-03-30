-- RLS policies
DROP POLICY IF EXISTS "Company admins can manage marketing documents" ON public.marketing_documents;
CREATE POLICY "Company admins can manage marketing documents"
  ON public.marketing_documents FOR ALL
  USING (has_role(auth.uid(), 'company_admin') AND company_id = get_user_company_id(auth.uid()));
