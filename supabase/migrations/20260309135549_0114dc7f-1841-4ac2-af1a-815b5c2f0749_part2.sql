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
        VALUES (v_enrollment_id, v_flow.flow_id, NEW.company_id, v_first_action_node_id, NEW.id, 'order', v_context)
ON CONFLICT DO NOTHING;
      END IF;
    END IF;
    UPDATE internal_automation_flows SET total_runs = total_runs + 1, last_run_at = now() WHERE id = v_flow.flow_id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
