CREATE POLICY "Admins can update company phone numbers"
  ON public.virtual_phone_numbers FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
