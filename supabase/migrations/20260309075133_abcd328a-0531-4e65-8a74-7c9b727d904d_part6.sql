DROP POLICY IF EXISTS "icc_del" ON public.internal_chat_channels;
CREATE POLICY "icc_del" ON public.internal_chat_channels FOR DELETE TO authenticated USING (company_id = public.get_my_company_id() AND created_by = auth.uid());
