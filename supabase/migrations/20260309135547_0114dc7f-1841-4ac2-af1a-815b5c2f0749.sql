-- 1) Add pg_cron job to process internal automation queue every minute
SELECT cron.schedule(
  'process-internal-automation-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://guqgszwelffntrgtsycm.supabase.co/functions/v1/process-internal-automation',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1cWdzendlbGZmbnRyZ3RzeWNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNjE5MDMsImV4cCI6MjA4NTkzNzkwM30.YO26Ym5QRe-uTTnfblUshvpFuIo0Y_MMfP8Qaqa_ivw"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- 2) Replace generic triggers with specific ones for order status
DROP TRIGGER IF EXISTS trg_internal_auto_order_updated ON orders;

CREATE OR REPLACE FUNCTION trigger_internal_auto_order_status()
RETURNS TRIGGER AS $$
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

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_trigger_types := v_trigger_types || 'order_status_changed';
    IF NEW.status IN ('completed', 'completato') THEN
      v_trigger_types := v_trigger_types || 'order_completed';
    END IF;
  END IF;

  FOREACH v_flow.flow_id IN ARRAY (
    SELECT COALESCE(array_agg(f.id), ARRAY[]::UUID[])
    FROM internal_automation_flows f
    WHERE f.company_id = NEW.company_id
      AND f.status = 'published'
      AND f.trigger_type = ANY(v_trigger_types)
  )
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_internal_auto_order_status
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION trigger_internal_auto_order_status();

-- 3) Replace generic ticket trigger with specific ones
DROP TRIGGER IF EXISTS trg_internal_auto_ticket_updated ON tickets;

CREATE OR REPLACE FUNCTION trigger_internal_auto_ticket_events()
RETURNS TRIGGER AS $$
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

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_trigger_types := v_trigger_types || 'ticket_status_changed';
    v_trigger_types := v_trigger_types || 'ticket_updated';
  END IF;
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    v_trigger_types := v_trigger_types || 'ticket_assigned';
  END IF;

  IF array_length(v_trigger_types, 1) IS NULL THEN RETURN NEW; END IF;

  FOR v_flow IN
    SELECT f.id AS flow_id FROM internal_automation_flows f
    WHERE f.company_id = NEW.company_id AND f.status = 'published' AND f.trigger_type = ANY(v_trigger_types)
  LOOP
    INSERT INTO internal_automation_enrollments (flow_id, company_id, entity_type, entity_id, context_json)
    VALUES (v_flow.flow_id, NEW.company_id, 'ticket', NEW.id, v_context) RETURNING id INTO v_enrollment_id;
    SELECT n.id INTO v_trigger_node_id FROM internal_automation_nodes n WHERE n.flow_id = v_flow.flow_id AND n.node_type = 'trigger' LIMIT 1;
    IF v_trigger_node_id IS NOT NULL THEN
      SELECT c.to_node_id INTO v_first_action_node_id FROM internal_automation_connections c WHERE c.flow_id = v_flow.flow_id AND c.from_node_id = v_trigger_node_id LIMIT 1;
      IF v_first_action_node_id IS NOT NULL THEN
        INSERT INTO internal_automation_queue (enrollment_id, flow_id, company_id, node_id, entity_id, entity_type, context_json)
        VALUES (v_enrollment_id, v_flow.flow_id, NEW.company_id, v_first_action_node_id, NEW.id, 'ticket', v_context);
      END IF;
    END IF;
    UPDATE internal_automation_flows SET total_runs = total_runs + 1, last_run_at = now() WHERE id = v_flow.flow_id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_internal_auto_ticket_events
AFTER UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION trigger_internal_auto_ticket_events();

-- 4) Replace generic task trigger
DROP TRIGGER IF EXISTS trg_internal_auto_task_updated ON tasks;

CREATE OR REPLACE FUNCTION trigger_internal_auto_task_events()
RETURNS TRIGGER AS $$
DECLARE
  v_flow RECORD;
  v_enrollment_id UUID;
  v_trigger_node_id UUID;
  v_first_action_node_id UUID;
  v_context JSONB;
  v_trigger_types TEXT[];
BEGIN
  v_context := to_jsonb(NEW) || jsonb_build_object('_old', to_jsonb(OLD));
  v_trigger_types := ARRAY['task_updated']::TEXT[];

  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('completed', 'completato') THEN
    v_trigger_types := v_trigger_types || 'task_completed';
  END IF;

  FOR v_flow IN
    SELECT f.id AS flow_id FROM internal_automation_flows f
    WHERE f.company_id = NEW.company_id AND f.status = 'published' AND f.trigger_type = ANY(v_trigger_types)
  LOOP
    INSERT INTO internal_automation_enrollments (flow_id, company_id, entity_type, entity_id, context_json)
    VALUES (v_flow.flow_id, NEW.company_id, 'task', NEW.id, v_context) RETURNING id INTO v_enrollment_id;
    SELECT n.id INTO v_trigger_node_id FROM internal_automation_nodes n WHERE n.flow_id = v_flow.flow_id AND n.node_type = 'trigger' LIMIT 1;
    IF v_trigger_node_id IS NOT NULL THEN
      SELECT c.to_node_id INTO v_first_action_node_id FROM internal_automation_connections c WHERE c.flow_id = v_flow.flow_id AND c.from_node_id = v_trigger_node_id LIMIT 1;
      IF v_first_action_node_id IS NOT NULL THEN
        INSERT INTO internal_automation_queue (enrollment_id, flow_id, company_id, node_id, entity_id, entity_type, context_json)
        VALUES (v_enrollment_id, v_flow.flow_id, NEW.company_id, v_first_action_node_id, NEW.id, 'task', v_context);
      END IF;
    END IF;
    UPDATE internal_automation_flows SET total_runs = total_runs + 1, last_run_at = now() WHERE id = v_flow.flow_id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_internal_auto_task_events
AFTER UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION trigger_internal_auto_task_events();

-- 5) Replace generic warehouse trigger with stock_below_minimum support
DROP TRIGGER IF EXISTS trg_internal_auto_stock_updated ON warehouse_stock;

CREATE OR REPLACE FUNCTION trigger_internal_auto_stock_events()
RETURNS TRIGGER AS $$
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

  IF NEW.quantity IS NOT NULL AND NEW.min_quantity IS NOT NULL AND NEW.quantity <= NEW.min_quantity THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_internal_auto_stock_events
AFTER UPDATE ON warehouse_stock
FOR EACH ROW
EXECUTE FUNCTION trigger_internal_auto_stock_events();