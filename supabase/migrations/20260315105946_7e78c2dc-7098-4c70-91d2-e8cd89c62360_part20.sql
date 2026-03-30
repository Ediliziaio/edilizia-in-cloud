DROP TRIGGER IF EXISTS trg_validate_chat_session_stato ON public.ai_chat_sessions;
CREATE TRIGGER trg_validate_chat_session_stato
  BEFORE INSERT OR UPDATE ON public.ai_chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.validate_chat_session_stato();
