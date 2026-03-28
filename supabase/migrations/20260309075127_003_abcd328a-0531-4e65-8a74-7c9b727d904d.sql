CREATE POLICY "icc_sel" ON public.internal_chat_channels FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
