CREATE POLICY "chat_sessions_company" ON public.ai_chat_sessions FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
