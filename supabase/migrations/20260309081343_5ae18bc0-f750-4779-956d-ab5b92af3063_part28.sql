CREATE POLICY "Anyone authenticated can read bank providers" ON public.bank_provider_configs FOR SELECT TO authenticated USING (true);
