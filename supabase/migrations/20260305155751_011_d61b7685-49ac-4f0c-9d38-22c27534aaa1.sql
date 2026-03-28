-- Trigger per aggiornare last_message_at quando arriva un nuovo messaggio
CREATE OR REPLACE FUNCTION public.update_ticket_last_message_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.tickets 
  SET last_message_at = NEW.created_at, updated_at = NEW.created_at
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;
