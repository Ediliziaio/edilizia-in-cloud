DROP POLICY IF EXISTS "icc_ins" ON public.internal_chat_channels;
CREATE POLICY "icc_ins" ON public.internal_chat_channels FOR INSERT TO authenticated WITH CHECK (company_id = public.get_my_company_id());
