DROP FUNCTION IF EXISTS public.trigger_internal_auto_appointment_events() CASCADE;
CREATE OR REPLACE FUNCTION public.trigger_internal_auto_appointment_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_flow RECORD;
  v_enrollment_id UUID;
  v_trigger_node_id UUID;
  v_first_action_node_id UUID;
  v_context JSONB;
  v_trigger_types TEXT[];
BEGIN
  v_context := to_jsonb(NEW) || jsonb_build_object('_old', to_jsonb(OLD));
  v_trigger_types := ARRAY['appointment_updated']::TEXT[];

  FOR v_flow IN
    SELECT f.id AS flow_id FROM internal_automation_flows f
    WHERE f.company_id = NEW.company_id AND f.status = 'published' AND f.trigger_type = ANY(v_trigger_types)
  LOOP
    INSERT INTO internal_automation_enrollments (flow_id, company_id, entity_type, entity_id, context_json)
    VALUES (v_flow.flow_id, NEW.company_id, 'appointment', NEW.id, v_context) RETURNING id INTO v_enrollment_id;

    SELECT n.id INTO v_trigger_node_id FROM internal_automation_nodes n WHERE n.flow_id = v_flow.flow_id AND n.node_type = 'trigger' LIMIT 1;
    IF v_trigger_node_id IS NOT NULL THEN
      SELECT c.to_node_id INTO v_first_action_node_id FROM internal_automation_connections c WHERE c.flow_id = v_flow.flow_id AND c.from_node_id = v_trigger_node_id LIMIT 1;
      IF v_first_action_node_id IS NOT NULL THEN
        INSERT INTO internal_automation_queue (enrollment_id, flow_id, company_id, node_id, entity_id, entity_type, context_json)
        VALUES (v_enrollment_id, v_flow.flow_id, NEW.company_id, v_first_action_node_id, NEW.id, 'appointment', v_context)
ON CONFLICT DO NOTHING;
      END IF;
    END IF;
    UPDATE internal_automation_flows SET total_runs = total_runs + 1, last_run_at = now() WHERE id = v_flow.flow_id;
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'trigger_internal_auto_appointment_events error: %', SQLERRM;
  RETURN NEW;
END;
$$;
