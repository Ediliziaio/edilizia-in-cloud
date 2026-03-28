CREATE POLICY "Company users can view own bank accounts" ON public.bank_accounts FOR SELECT TO authenticated USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
