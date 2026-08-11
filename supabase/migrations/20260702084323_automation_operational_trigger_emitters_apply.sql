-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Re-apply della migration 20270616110000 (in git ma MAI applicata in prod:
-- trg_fire_* assenti → i trigger operativi non scattavano). Contenuto identico al file.
CREATE OR REPLACE FUNCTION public.fire_order_automation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _status_name text;
  _old_status_name text;
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
    VALUES (NEW.company_id, 'order_created', NEW.id::text, 'order',
      jsonb_build_object('order_id', NEW.id, 'order_code', NEW.order_code, 'total_amount', NEW.total_amount,
        'customer_id', NEW.customer_id, 'current_status_id', NEW.current_status_id, 'status', NEW.status,
        'order_type', NEW.order_type, 'assigned_to', NEW.assigned_to, 'description', NEW.description,
        'work_start_date', NEW.work_start_date, 'work_end_date', NEW.work_end_date, 'created_at', NEW.created_at));
  ELSIF TG_OP = 'UPDATE' THEN
    IF (NEW.current_status_id IS DISTINCT FROM OLD.current_status_id) OR (NEW.status IS DISTINCT FROM OLD.status) THEN
      SELECT name INTO _status_name FROM public.order_statuses WHERE id = NEW.current_status_id;
      SELECT name INTO _old_status_name FROM public.order_statuses WHERE id = OLD.current_status_id;
      INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
      VALUES (NEW.company_id, 'order_status_changed', NEW.id::text, 'order',
        jsonb_build_object('order_id', NEW.id, 'order_code', NEW.order_code, 'current_status_id', NEW.current_status_id,
          'old_status_id', OLD.current_status_id, 'status', NEW.status, 'old_status', OLD.status,
          'status_name', _status_name, 'old_status_name', _old_status_name, 'customer_id', NEW.customer_id,
          'total_amount', NEW.total_amount, 'order_type', NEW.order_type));
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fire_order_automation error: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fire_order_automation ON public.orders;
CREATE TRIGGER trg_fire_order_automation AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.fire_order_automation();

CREATE OR REPLACE FUNCTION public.fire_invoice_automation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
  VALUES (NEW.company_id, 'invoice_created', NEW.id::text, 'invoice',
    jsonb_build_object('invoice_id', NEW.id, 'invoice_number', NEW.invoice_number, 'total', NEW.total,
      'tax_amount', NEW.tax_amount, 'client_company_name', NEW.client_company_name, 'client_email', NEW.client_email,
      'due_date', NEW.due_date, 'status', NEW.status, 'document_type', NEW.document_type,
      'client_id', NEW.client_id, 'order_id', NEW.order_id));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fire_invoice_automation error: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fire_invoice_automation ON public.invoices;
CREATE TRIGGER trg_fire_invoice_automation AFTER INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.fire_invoice_automation();

CREATE OR REPLACE FUNCTION public.fire_payment_automation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
  VALUES (NEW.company_id, 'payment_received', NEW.id::text, 'payment',
    jsonb_build_object('pagamento_id', NEW.id, 'importo', NEW.amount, 'metodo', NEW.payment_method,
      'fattura_id', NEW.invoice_id, 'data', NEW.payment_date, 'reference', NEW.reference));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fire_payment_automation error: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fire_payment_automation ON public.invoice_payments;
CREATE TRIGGER trg_fire_payment_automation AFTER INSERT ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION public.fire_payment_automation();

CREATE OR REPLACE FUNCTION public.fire_cost_automation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
  VALUES (NEW.company_id, 'cost_registered', NEW.id::text, 'cost',
    jsonb_build_object('costo_id', NEW.id, 'importo', NEW.amount, 'categoria', NEW.category,
      'descrizione', NEW.name, 'fornitore', NEW.supplier_id, 'cost_type', NEW.cost_type,
      'due_date', NEW.due_date, 'is_paid', NEW.is_paid));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fire_cost_automation error: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fire_cost_automation ON public.company_costs;
CREATE TRIGGER trg_fire_cost_automation AFTER INSERT ON public.company_costs FOR EACH ROW EXECUTE FUNCTION public.fire_cost_automation();

CREATE OR REPLACE FUNCTION public.fire_quote_automation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _accepted boolean := false;
  _rejected boolean := false;
  _new_status text := lower(coalesce(NEW.status, ''));
  _old_status text := lower(coalesce(OLD.status, ''));
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
    VALUES (NEW.company_id, 'quote_created', NEW.id::text, 'quote',
      jsonb_build_object('preventivo_id', NEW.id, 'quote_number', NEW.quote_number, 'total', NEW.total,
        'client_name', NEW.client_name, 'client_email', NEW.client_email, 'contact_id', NEW.contact_id,
        'expires_at', NEW.expires_at, 'status', NEW.status));
  ELSIF TG_OP = 'UPDATE' THEN
    _accepted := (OLD.signed_at IS NULL AND NEW.signed_at IS NOT NULL)
      OR (_new_status IS DISTINCT FROM _old_status AND _new_status IN ('accettato','accepted','firmato','approvato','approved','vinto','won'));
    _rejected := (OLD.refused_at IS NULL AND NEW.refused_at IS NOT NULL)
      OR (_new_status IS DISTINCT FROM _old_status AND _new_status IN ('rifiutato','rejected','declined','perso','lost'));
    IF _accepted THEN
      INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
      VALUES (NEW.company_id, 'quote_accepted', NEW.id::text, 'quote',
        jsonb_build_object('preventivo_id', NEW.id, 'quote_number', NEW.quote_number, 'total', NEW.total,
          'client_name', NEW.client_name, 'client_email', NEW.client_email, 'contact_id', NEW.contact_id, 'status', NEW.status));
    ELSIF _rejected THEN
      INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
      VALUES (NEW.company_id, 'quote_rejected', NEW.id::text, 'quote',
        jsonb_build_object('preventivo_id', NEW.id, 'quote_number', NEW.quote_number, 'client_name', NEW.client_name,
          'client_email', NEW.client_email, 'contact_id', NEW.contact_id, 'status', NEW.status, 'refused_reason', NEW.refused_reason));
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fire_quote_automation error: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fire_quote_automation ON public.quotes;
CREATE TRIGGER trg_fire_quote_automation AFTER INSERT OR UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.fire_quote_automation();

CREATE OR REPLACE FUNCTION public.fire_ticket_automation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
    VALUES (NEW.company_id, 'ticket_created', NEW.id::text, 'ticket',
      jsonb_build_object('ticket_id', NEW.id, 'subject', NEW.subject, 'priority', NEW.priority::text,
        'category', NEW.category, 'customer_id', NEW.customer_id, 'assigned_to', NEW.assigned_to, 'status', NEW.status::text));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
      VALUES (NEW.company_id, 'ticket_status_changed', NEW.id::text, 'ticket',
        jsonb_build_object('ticket_id', NEW.id, 'subject', NEW.subject, 'status', NEW.status::text,
          'old_status', OLD.status::text, 'customer_id', NEW.customer_id, 'assigned_to', NEW.assigned_to));
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fire_ticket_automation error: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fire_ticket_automation ON public.tickets;
CREATE TRIGGER trg_fire_ticket_automation AFTER INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.fire_ticket_automation();

CREATE OR REPLACE FUNCTION public.fire_stock_automation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.quantity <= 0 AND OLD.quantity > 0 THEN
    INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
    VALUES (NEW.company_id, 'stock_out', NEW.id::text, 'stock',
      jsonb_build_object('prodotto_id', NEW.id, 'name', NEW.name));
  ELSIF NEW.min_stock_level > 0 AND NEW.quantity > 0 AND NEW.quantity < NEW.min_stock_level
        AND (OLD.quantity >= OLD.min_stock_level OR OLD.quantity >= NEW.min_stock_level) THEN
    INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
    VALUES (NEW.company_id, 'stock_below_minimum', NEW.id::text, 'stock',
      jsonb_build_object('prodotto_id', NEW.id, 'name', NEW.name, 'quantity', NEW.quantity,
        'min_stock_level', NEW.min_stock_level, 'supplier_id', NEW.supplier_id));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fire_stock_automation error: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fire_stock_automation ON public.warehouse_stock;
CREATE TRIGGER trg_fire_stock_automation AFTER UPDATE ON public.warehouse_stock
  FOR EACH ROW WHEN (OLD.quantity IS DISTINCT FROM NEW.quantity OR OLD.min_stock_level IS DISTINCT FROM NEW.min_stock_level)
  EXECUTE FUNCTION public.fire_stock_automation();

CREATE OR REPLACE FUNCTION public.fire_stock_movement_automation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _company_id uuid;
BEGIN
  IF NEW.movement_type <> 'carico' THEN RETURN NEW; END IF;
  _company_id := COALESCE(NEW.company_id, (SELECT company_id FROM public.warehouse_stock WHERE id = NEW.stock_item_id));
  IF _company_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
  VALUES (_company_id, 'stock_received', NEW.id::text, 'stock_movement',
    jsonb_build_object('carico_id', NEW.id, 'stock_item_id', NEW.stock_item_id, 'quantity', NEW.quantity,
      'order_id', NEW.order_id, 'lot_number', NEW.lot_number));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fire_stock_movement_automation error: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fire_stock_movement_automation ON public.warehouse_movements;
CREATE TRIGGER trg_fire_stock_movement_automation AFTER INSERT ON public.warehouse_movements FOR EACH ROW EXECUTE FUNCTION public.fire_stock_movement_automation();

CREATE OR REPLACE FUNCTION public.fire_employee_automation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
  VALUES (NEW.company_id, 'employee_created', NEW.id::text, 'employee',
    jsonb_build_object('dipendente_id', NEW.id, 'first_name', NEW.first_name, 'last_name', NEW.last_name, 'email', NEW.email));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fire_employee_automation error: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fire_employee_automation ON public.employees;
CREATE TRIGGER trg_fire_employee_automation AFTER INSERT ON public.employees FOR EACH ROW EXECUTE FUNCTION public.fire_employee_automation();

CREATE OR REPLACE FUNCTION public.fire_leave_automation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
  VALUES (NEW.company_id, 'leave_requested', NEW.id::text, 'leave_request',
    jsonb_build_object('richiesta_id', NEW.id, 'employee_id', NEW.employee_id, 'tipo', NEW.type,
      'data_inizio', NEW.start_date, 'data_fine', NEW.end_date, 'giorni', NEW.total_days, 'status', NEW.status));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fire_leave_automation error: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fire_leave_automation ON public.leave_requests;
CREATE TRIGGER trg_fire_leave_automation AFTER INSERT ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.fire_leave_automation();

CREATE OR REPLACE FUNCTION public.fire_task_automation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _new_status text := lower(coalesce(NEW.status, ''));
  _old_status text := lower(coalesce(OLD.status, ''));
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
    VALUES (NEW.company_id, 'task_created', NEW.id::text, 'task',
      jsonb_build_object('task_id', NEW.id, 'title', NEW.title, 'priority', NEW.priority,
        'assigned_to', NEW.assigned_to, 'due_date', NEW.due_date, 'status', NEW.status, 'category', NEW.category));
  ELSIF TG_OP = 'UPDATE' THEN
    IF _new_status IS DISTINCT FROM _old_status AND _new_status IN ('completato','completed','done','fatto') THEN
      INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
      VALUES (NEW.company_id, 'task_completed', NEW.id::text, 'task',
        jsonb_build_object('task_id', NEW.id, 'title', NEW.title, 'assigned_to', NEW.assigned_to,
          'completed_at', NEW.completed_at, 'status', NEW.status));
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fire_task_automation error: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fire_task_automation ON public.tasks;
CREATE TRIGGER trg_fire_task_automation AFTER INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.fire_task_automation();
