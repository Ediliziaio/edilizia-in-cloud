CREATE POLICY "icm_del" ON public.internal_chat_members FOR DELETE TO authenticated USING (company_id = public.get_my_company_id());
