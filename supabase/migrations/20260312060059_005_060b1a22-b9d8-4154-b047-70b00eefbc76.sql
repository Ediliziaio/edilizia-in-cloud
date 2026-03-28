CREATE POLICY "Admins can insert company phone numbers"
  ON public.virtual_phone_numbers FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
