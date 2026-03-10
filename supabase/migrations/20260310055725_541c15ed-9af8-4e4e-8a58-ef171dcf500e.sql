
-- ============================================================
-- [N3] Trigger automatici per notifiche
-- ============================================================

-- 1. Nuovo ticket → notifica staff
CREATE OR REPLACE FUNCTION public.notify_new_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_name text;
BEGIN
  SELECT COALESCE(first_name || ' ' || last_name, email)
    INTO v_customer_name
    FROM profiles WHERE id = NEW.customer_id;

  IF NEW.assigned_to IS NOT NULL THEN
    PERFORM create_notification(
      NEW.company_id,
      NEW.assigned_to,
      'ticket',
      'Nuovo ticket: ' || NEW.subject,
      'Da ' || COALESCE(v_customer_name, 'Cliente'),
      'ticket',
      NEW.id,
      '/azienda/ticket/' || NEW.id
    );
  ELSE
    -- notifica tutti company_admin e company_staff
    PERFORM create_notification(
      NEW.company_id,
      ur.user_id,
      'ticket',
      'Nuovo ticket: ' || NEW.subject,
      'Da ' || COALESCE(v_customer_name, 'Cliente'),
      'ticket',
      NEW.id,
      '/azienda/ticket/' || NEW.id
    )
    FROM user_roles ur
    JOIN profiles p ON p.id = ur.user_id AND p.company_id = NEW.company_id
    WHERE ur.role IN ('company_admin', 'company_staff');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_ticket ON tickets;
CREATE TRIGGER trg_notify_new_ticket
  AFTER INSERT ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_ticket();

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

DROP TRIGGER IF EXISTS trg_notify_ticket_reply ON ticket_messages;
CREATE TRIGGER trg_notify_ticket_reply
  AFTER INSERT ON ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_ticket_reply();

-- 3. Task assegnato → notifica assegnatario
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text;
BEGIN
  IF NEW.assigned_to IS NULL OR NEW.assigned_to = NEW.created_by THEN
    RETURN NEW;
  END IF;

  v_body := NEW.title;
  IF NEW.due_date IS NOT NULL THEN
    v_body := v_body || ' — Scadenza: ' || to_char(NEW.due_date::date, 'DD/MM/YYYY');
  END IF;

  PERFORM create_notification(
    NEW.company_id,
    NEW.assigned_to,
    'task',
    'Nuova attività assegnata',
    v_body,
    'task',
    NEW.id,
    '/azienda/task'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_assigned ON tasks;
CREATE TRIGGER trg_notify_task_assigned
  AFTER INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_assigned();

-- 4. Ordine cambia stato → notifica assigned_to
CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_name text;
  v_description text;
BEGIN
  IF OLD.current_status_id IS NOT DISTINCT FROM NEW.current_status_id THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  -- Non notificare se l'utente corrente e' l'assegnatario
  IF auth.uid() = NEW.assigned_to THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_status_name
    FROM order_statuses WHERE id = NEW.current_status_id;

  v_description := NEW.description;
  IF length(v_description) > 60 THEN
    v_description := left(v_description, 57) || '...';
  END IF;

  PERFORM create_notification(
    NEW.company_id,
    NEW.assigned_to,
    'order',
    'Ordine aggiornato: ' || COALESCE(v_description, 'N/D'),
    'Nuovo stato: ' || COALESCE(v_status_name, 'sconosciuto'),
    'order',
    NEW.id,
    '/azienda/ordini/' || NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_status_change ON orders;
CREATE TRIGGER trg_notify_order_status_change
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_order_status_change();
