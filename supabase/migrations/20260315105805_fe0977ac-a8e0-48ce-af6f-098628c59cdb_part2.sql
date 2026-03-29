DO $$ BEGIN
  ALTER FUNCTION public.validate_chat_session_stato() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
