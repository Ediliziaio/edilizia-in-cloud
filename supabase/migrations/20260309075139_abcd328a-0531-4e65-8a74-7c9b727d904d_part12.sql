CREATE POLICY "icm_ins" ON public.internal_chat_members FOR INSERT TO authenticated WITH CHECK (company_id = public.get_my_company_id());
