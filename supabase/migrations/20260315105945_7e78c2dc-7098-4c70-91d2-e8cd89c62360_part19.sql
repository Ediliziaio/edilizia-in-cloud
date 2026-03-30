-- Validation trigger for chat session stato
DROP FUNCTION IF EXISTS public.validate_chat_session_stato() CASCADE;
CREATE OR REPLACE FUNCTION public.validate_chat_session_stato()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stato NOT IN ('attiva', 'chiusa', 'archiviata') THEN
    RAISE EXCEPTION 'Invalid chat session stato: %', NEW.stato;
  END IF;
  RETURN NEW;
END;
$$;
