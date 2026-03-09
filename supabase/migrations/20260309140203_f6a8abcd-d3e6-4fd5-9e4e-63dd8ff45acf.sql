
-- ═══════════════════════════════════════════════════════
-- Phase 1: Fix trigger functions for actual column names
-- and attach triggers to real tables
-- ═══════════════════════════════════════════════════════

-- Fix order status function: orders uses current_status_id, not status
CREATE OR REPLACE FUNCTION public.trigger_internal_auto_order_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_flow RECORD;
  v_enrollment_id UUID;
  v_trigger_node_id UUID;
  v_first_action_node_id UUID;
  v_context JSONB;
  v_trigger_types TEXT[];
BEGIN
  v_context := to_jsonb(NEW) || jsonb_build_object('_old', to_jsonb(OLD));
  v_trigger_types := ARRAY[]::TEXT[];

  -- orders uses current_status_id not status
  IF OLD.current_status_id IS DISTINCT FROM NEW.current_status_id THEN
    v_trigger_types := v_trigger_types || 'order_status_changed';
    v_trigger_types := v_trigger_types || 'order_updated';
  END IF;

  IF array_length(v_trigger_types, 1) IS NULL THEN RETURN NEW; END IF;

  FOR v_flow IN
    SELECT f.id AS flow_id FROM internal_automation_flows f
    WHERE f.company_id = NEW.company_id AND f.status = 'published' AND f.trigger_type = ANY(v_trigger_types)
  LOOP
    INSERT INTO internal_automation_enrollments (flow_id, company_id, entity_type, entity_id, context_json)
    VALUES (v_flow.flow_id, NEW.company_id, 'order', NEW.id, v_context) RETURNING id INTO v_enrollment_id;
    SELECT n.id INTO v_trigger_node_id FROM internal_automation_nodes n WHERE n.flow_id = v_flow.flow_id AND n.node_type = 'trigger' LIMIT 1;
    IF v_trigger_node_id IS NOT NULL THEN
      SELECT c.to_node_id INTO v_first_action_node_id FROM internal_automation_connections c WHERE c.flow_id = v_flow.flow_id AND c.from_node_id = v_trigger_node_id LIMIT 1;
      IF v_first_action_node_id IS NOT NULL THEN
        INSERT INTO internal_automation_queue (enrollment_id, flow_id, company_id, node_id, entity_id, entity_type, context_json)
        VALUES (v_enrollment_id, v_flow.flow_id, NEW.company_id, v_first_action_node_id, NEW.id, 'order', v_context);
      END IF;
    END IF;
    UPDATE internal_automation_flows SET total_runs = total_runs + 1, last_run_at = now() WHERE id = v_flow.flow_id;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Fix stock events function: warehouse_stock uses min_stock_level, not min_quantity
CREATE OR REPLACE FUNCTION public.trigger_internal_auto_stock_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_flow RECORD;
  v_enrollment_id UUID;
  v_trigger_node_id UUID;
  v_first_action_node_id UUID;
  v_context JSONB;
  v_trigger_types TEXT[];
BEGIN
  v_context := to_jsonb(NEW) || jsonb_build_object('_old', to_jsonb(OLD));
  v_trigger_types := ARRAY['stock_updated']::TEXT[];

  IF NEW.quantity IS NOT NULL AND NEW.min_stock_level IS NOT NULL AND NEW.quantity <= NEW.min_stock_level THEN
    v_trigger_types := v_trigger_types || 'stock_below_minimum';
  END IF;

  FOR v_flow IN
    SELECT f.id AS flow_id FROM internal_automation_flows f
    WHERE f.company_id = NEW.company_id AND f.status = 'published' AND f.trigger_type = ANY(v_trigger_types)
  LOOP
    INSERT INTO internal_automation_enrollments (flow_id, company_id, entity_type, entity_id, context_json)
    VALUES (v_flow.flow_id, NEW.company_id, 'warehouse_stock', NEW.id, v_context) RETURNING id INTO v_enrollment_id;
    SELECT n.id INTO v_trigger_node_id FROM internal_automation_nodes n WHERE n.flow_id = v_flow.flow_id AND n.node_type = 'trigger' LIMIT 1;
    IF v_trigger_node_id IS NOT NULL THEN
      SELECT c.to_node_id INTO v_first_action_node_id FROM internal_automation_connections c WHERE c.flow_id = v_flow.flow_id AND c.from_node_id = v_trigger_node_id LIMIT 1;
      IF v_first_action_node_id IS NOT NULL THEN
        INSERT INTO internal_automation_queue (enrollment_id, flow_id, company_id, node_id, entity_id, entity_type, context_json)
        VALUES (v_enrollment_id, v_flow.flow_id, NEW.company_id, v_first_action_node_id, NEW.id, 'warehouse_stock', v_context);
      END IF;
    END IF;
    UPDATE internal_automation_flows SET total_runs = total_runs + 1, last_run_at = now() WHERE id = v_flow.flow_id;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ═══════════════════════════════════════════════════════
-- Now attach all 9 triggers to the actual tables
-- ═══════════════════════════════════════════════════════

-- 1) Order created
CREATE TRIGGER internal_auto_order_created
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_automations('order_created', 'order');

-- 2) Order status changed (UPDATE)
CREATE TRIGGER internal_auto_order_status
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_auto_order_status();

-- 3) Ticket created
CREATE TRIGGER internal_auto_ticket_created
  AFTER INSERT ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_automations('ticket_created', 'ticket');

-- 4) Ticket status / assigned changed
CREATE TRIGGER internal_auto_ticket_events
  AFTER UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_auto_ticket_events();

-- 5) Task created
CREATE TRIGGER internal_auto_task_created
  AFTER INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_automations('task_created', 'task');

-- 6) Task completed / updated
CREATE TRIGGER internal_auto_task_events
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_auto_task_events();

-- 7) Employee added
CREATE TRIGGER internal_auto_employee_added
  AFTER INSERT ON employees
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_automations('employee_added', 'employee');

-- 8) Warehouse stock low
CREATE TRIGGER internal_auto_warehouse_stock
  AFTER UPDATE ON warehouse_stock
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_auto_stock_events();

-- 9) Cost added
CREATE TRIGGER internal_auto_cost_added
  AFTER INSERT ON company_costs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_automations('cost_created', 'cost');
