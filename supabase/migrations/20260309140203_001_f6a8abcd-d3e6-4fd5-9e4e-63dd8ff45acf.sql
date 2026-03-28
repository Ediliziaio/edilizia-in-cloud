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
