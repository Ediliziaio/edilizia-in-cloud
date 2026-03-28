CREATE POLICY "Admins can delete company phone numbers"
  ON public.virtual_phone_numbers FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());
