DROP POLICY IF EXISTS "Company admins can manage contact notes" ON public.marketing_contact_notes;
CREATE POLICY "Company admins can manage contact notes"
  ON public.marketing_contact_notes FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));
