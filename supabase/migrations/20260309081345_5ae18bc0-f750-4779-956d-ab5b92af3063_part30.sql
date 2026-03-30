DROP POLICY IF EXISTS "Company users can view own bank connections" ON public.bank_connections;
CREATE POLICY "Company users can view own bank connections" ON public.bank_connections FOR SELECT TO authenticated USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
