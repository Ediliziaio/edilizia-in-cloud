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
