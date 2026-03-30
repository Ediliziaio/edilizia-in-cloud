-- 2. Risposta ticket → notifica controparte
CREATE OR REPLACE FUNCTION public.notify_ticket_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket record;
  v_sender_name text;
BEGIN
  SELECT company_id, assigned_to, customer_id, subject
    INTO v_ticket
    FROM tickets WHERE id = NEW.ticket_id;

  IF v_ticket IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(first_name || ' ' || last_name, email)
    INTO v_sender_name
    FROM profiles WHERE id = NEW.sender_id;

  -- Se il sender non e' l'assegnatario, notifica l'assegnatario
  IF v_ticket.assigned_to IS NOT NULL AND NEW.sender_id != v_ticket.assigned_to THEN
    PERFORM create_notification(
      v_ticket.company_id,
      v_ticket.assigned_to,
      'ticket',
      'Risposta su: ' || v_ticket.subject,
      'Da ' || COALESCE(v_sender_name, 'Utente'),
      'ticket',
      NEW.ticket_id,
      '/azienda/ticket/' || NEW.ticket_id
    );
  END IF;

  -- Se il sender non e' il cliente, notifica il cliente
  IF NEW.sender_id != v_ticket.customer_id THEN
    PERFORM create_notification(
      v_ticket.company_id,
      v_ticket.customer_id,
      'ticket',
      'Risposta su: ' || v_ticket.subject,
      'Da ' || COALESCE(v_sender_name, 'Supporto'),
      'ticket',
      NEW.ticket_id,
      '/azienda/ticket/' || NEW.ticket_id
    );
  END IF;

  RETURN NEW;
END;
$$;
