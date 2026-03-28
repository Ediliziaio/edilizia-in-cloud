-- Validation trigger for message ruolo
CREATE OR REPLACE FUNCTION public.validate_chat_message_ruolo()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ruolo NOT IN ('user', 'assistant', 'system') THEN
    RAISE EXCEPTION 'Invalid message ruolo: %', NEW.ruolo;
  END IF;
  RETURN NEW;
END;
$$;
