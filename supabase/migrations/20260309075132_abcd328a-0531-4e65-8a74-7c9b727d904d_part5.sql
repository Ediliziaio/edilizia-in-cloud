DROP POLICY IF EXISTS "icc_upd" ON public.internal_chat_channels;
CREATE POLICY "icc_upd" ON public.internal_chat_channels FOR UPDATE TO authenticated USING (company_id = public.get_my_company_id());
