
-- ═══════════════════════════════════════════════════════
-- Drop ALL conflicting triggers from previous migrations
-- ═══════════════════════════════════════════════════════

-- From migration 1 (trg_internal_auto_*)
DROP TRIGGER IF EXISTS trg_internal_auto_order_created ON public.orders;
DROP TRIGGER IF EXISTS trg_internal_auto_order_status ON public.orders;
DROP TRIGGER IF EXISTS trg_internal_auto_ticket_created ON public.tickets;
DROP TRIGGER IF EXISTS trg_internal_auto_ticket_status ON public.tickets;
DROP TRIGGER IF EXISTS trg_internal_auto_task_created ON public.tasks;
DROP TRIGGER IF EXISTS trg_internal_auto_task_completed ON public.tasks;

-- From migration 2/3 (internal_auto_*)
DROP TRIGGER IF EXISTS internal_auto_order_created ON public.orders;
DROP TRIGGER IF EXISTS internal_auto_order_status ON public.orders;
DROP TRIGGER IF EXISTS internal_auto_ticket_created ON public.tickets;
DROP TRIGGER IF EXISTS internal_auto_ticket_status ON public.tickets;
DROP TRIGGER IF EXISTS internal_auto_task_created ON public.tasks;
DROP TRIGGER IF EXISTS internal_auto_task_completed ON public.tasks;
DROP TRIGGER IF EXISTS internal_auto_employee_added ON public.employees;
DROP TRIGGER IF EXISTS internal_auto_warehouse_low ON public.warehouse_stock;
DROP TRIGGER IF EXISTS internal_auto_cost_added ON public.company_costs;

-- New names for appointments (never created before)
DROP TRIGGER IF EXISTS ia_appointment_created ON public.appointments;
DROP TRIGGER IF EXISTS ia_appointment_updated ON public.appointments;

-- ═══════════════════════════════════════════════════════
-- Fix: update order_status function to also emit order_completed
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trigger_internal_auto_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Always emit order_updated
  INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
  VALUES (NEW.company_id, 'order_updated', 'order', NEW.id, row_to_json(NEW));

  -- Status changed
  IF OLD.current_status_id IS DISTINCT FROM NEW.current_status_id THEN
    INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
    VALUES (NEW.company_id, 'order_status_changed', 'order', NEW.id,
      jsonb_build_object('new', row_to_json(NEW), 'old', row_to_json(OLD)));
  END IF;

  -- Order completed (check for common "completed" status names)
  IF OLD.current_status_id IS DISTINCT FROM NEW.current_status_id THEN
    -- Check if the new status name indicates completion
    PERFORM 1 FROM order_statuses
      WHERE id = NEW.current_status_id
        AND (lower(name) IN ('completato', 'completed', 'chiuso', 'closed', 'consegnato', 'delivered'));
    IF FOUND THEN
      INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
      VALUES (NEW.company_id, 'order_completed', 'order', NEW.id, row_to_json(NEW));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Fix: update ticket_events function for ticket_assigned + ticket_updated
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trigger_internal_auto_ticket_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Always emit ticket_updated
  INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
  VALUES (NEW.company_id, 'ticket_updated', 'ticket', NEW.id, row_to_json(NEW));

  -- Status changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
    VALUES (NEW.company_id, 'ticket_status_changed', 'ticket', NEW.id,
      jsonb_build_object('new', row_to_json(NEW), 'old', row_to_json(OLD)));
  END IF;

  -- Assigned
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
    VALUES (NEW.company_id, 'ticket_assigned', 'ticket', NEW.id, row_to_json(NEW));
  END IF;

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Fix: update task_events function for task_updated + task_completed
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trigger_internal_auto_task_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Always emit task_updated
  INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
  VALUES (NEW.company_id, 'task_updated', 'task', NEW.id, row_to_json(NEW));

  -- Task completed
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
    VALUES (NEW.company_id, 'task_completed', 'task', NEW.id, row_to_json(NEW));
  END IF;

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════
-- NEW: appointment trigger functions
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trigger_internal_auto_appointment_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO internal_automation_trigger_events (company_id, trigger_event, entity_type, entity_id, payload)
  VALUES (NEW.company_id, 'appointment_updated', 'appointment', NEW.id, row_to_json(NEW));
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════
-- CREATE definitive triggers with unique names (ia_ prefix)
-- ═══════════════════════════════════════════════════════

-- Orders
CREATE TRIGGER ia_order_created
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('order_created', 'order');

CREATE TRIGGER ia_order_status
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_order_status();

-- Tickets
CREATE TRIGGER ia_ticket_created
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('ticket_created', 'ticket');

CREATE TRIGGER ia_ticket_events
  AFTER UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_ticket_events();

-- Tasks
CREATE TRIGGER ia_task_created
  AFTER INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('task_created', 'task');

CREATE TRIGGER ia_task_events
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_task_events();

-- Employees
CREATE TRIGGER ia_employee_added
  AFTER INSERT ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('employee_added', 'employee');

-- Warehouse stock
CREATE TRIGGER ia_warehouse_stock
  AFTER UPDATE ON public.warehouse_stock
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_stock_events();

-- Company costs (fixed: cost_created, not cost_added)
CREATE TRIGGER ia_cost_created
  AFTER INSERT ON public.company_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('cost_created', 'cost');

-- Appointments
CREATE TRIGGER ia_appointment_created
  AFTER INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('appointment_created', 'appointment');

CREATE TRIGGER ia_appointment_updated
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_appointment_events();
