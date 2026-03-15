
-- Fix search_path on trigger functions
ALTER FUNCTION public.validate_kb_sync_status() SET search_path = public;
ALTER FUNCTION public.set_kb_updated_at() SET search_path = public;
ALTER FUNCTION public.validate_chat_session_stato() SET search_path = public;
ALTER FUNCTION public.validate_chat_message_ruolo() SET search_path = public;
