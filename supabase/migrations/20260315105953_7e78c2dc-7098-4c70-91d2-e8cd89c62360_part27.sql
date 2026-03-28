CREATE TRIGGER trg_validate_chat_message_ruolo
  BEFORE INSERT OR UPDATE ON public.ai_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_chat_message_ruolo();
