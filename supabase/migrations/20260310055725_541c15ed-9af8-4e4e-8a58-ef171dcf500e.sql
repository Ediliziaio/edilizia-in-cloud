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
