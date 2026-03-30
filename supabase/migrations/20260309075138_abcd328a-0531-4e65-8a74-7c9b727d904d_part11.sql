DROP POLICY IF EXISTS "icm_sel" ON public.internal_chat_members;
CREATE POLICY "icm_sel" ON public.internal_chat_members FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
