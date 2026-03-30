DROP POLICY IF EXISTS "icm_upd" ON public.internal_chat_members;
CREATE POLICY "icm_upd" ON public.internal_chat_members FOR UPDATE TO authenticated USING (company_id = public.get_my_company_id() AND user_id = auth.uid());
