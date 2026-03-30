-- RLS via session join
DROP POLICY IF EXISTS "chat_messages_via_session" ON public.ai_chat_messages;
CREATE POLICY "chat_messages_via_session" ON public.ai_chat_messages FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ai_chat_sessions s
    WHERE s.id = ai_chat_messages.session_id
    AND s.company_id = public.get_my_company_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ai_chat_sessions s
    WHERE s.id = ai_chat_messages.session_id
    AND s.company_id = public.get_my_company_id()
  ));
