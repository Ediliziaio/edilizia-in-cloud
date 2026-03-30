-- Trigger helper function
DROP FUNCTION IF EXISTS public.trigger_internal_automations() CASCADE;
CREATE OR REPLACE FUNCTION public.trigger_internal_automations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trigger_type TEXT;
  v_entity_type TEXT;
  v_company_id UUID;
  v_entity_id UUID;
  v_context JSONB;
  v_flow RECORD;
  v_trigger_node_id UUID;
  v_first_action_node_id UUID;
  v_enrollment_id UUID;
BEGIN
  v_trigger_type := TG_ARGV[0];
  v_entity_type := TG_ARGV[1];

  IF TG_OP = 'DELETE' THEN
    v_company_id := OLD.company_id;
    v_entity_id := OLD.id;
    v_context := to_jsonb(OLD);
  ELSE
    v_company_id := NEW.company_id;
    v_entity_id := NEW.id;
    v_context := to_jsonb(NEW);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_context := v_context || jsonb_build_object('_old', to_jsonb(OLD));
  END IF;

  FOR v_flow IN
    SELECT f.id AS flow_id
    FROM internal_automation_flows f
    WHERE f.company_id = v_company_id
      AND f.status = 'published'
      AND f.trigger_type = v_trigger_type
  LOOP
    INSERT INTO internal_automation_enrollments (flow_id, company_id, entity_type, entity_id, context_json)
    VALUES (v_flow.flow_id, v_company_id, v_entity_type, v_entity_id, v_context)
    RETURNING id INTO v_enrollment_id;

    SELECT n.id INTO v_trigger_node_id
    FROM internal_automation_nodes n
    WHERE n.flow_id = v_flow.flow_id AND n.node_type = 'trigger'
    LIMIT 1;

    IF v_trigger_node_id IS NOT NULL THEN
      SELECT c.to_node_id INTO v_first_action_node_id
      FROM internal_automation_connections c
      WHERE c.flow_id = v_flow.flow_id AND c.from_node_id = v_trigger_node_id
      LIMIT 1;

      IF v_first_action_node_id IS NOT NULL THEN
        INSERT INTO internal_automation_queue (
          enrollment_id, flow_id, company_id, node_id, entity_id, entity_type, context_json
        ) VALUES (
          v_enrollment_id, v_flow.flow_id, v_company_id, v_first_action_node_id,
          v_entity_id, v_entity_type, v_context
        )
ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    UPDATE internal_automation_flows SET total_runs = total_runs + 1, last_run_at = now() WHERE id = v_flow.flow_id;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
