CREATE POLICY "Company users can view own sync logs" ON public.bank_sync_logs FOR SELECT TO authenticated USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
