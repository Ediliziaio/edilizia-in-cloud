DO $$ BEGIN
  ALTER FUNCTION public.validate_chat_message_ruolo() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
