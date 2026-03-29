CREATE POLICY "Users can view own company lead forms"
  ON public.meta_lead_forms FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
