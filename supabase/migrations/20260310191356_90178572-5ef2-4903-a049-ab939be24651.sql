
CREATE OR REPLACE FUNCTION public.save_internal_automation_nodes(
  p_flow_id uuid,
  p_company_id uuid,
  p_nodes jsonb DEFAULT '[]'::jsonb,
  p_connections jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete existing connections and nodes atomically
  DELETE FROM internal_automation_connections WHERE flow_id = p_flow_id AND company_id = p_company_id;
  DELETE FROM internal_automation_nodes WHERE flow_id = p_flow_id AND company_id = p_company_id;

  -- Insert new nodes
  IF jsonb_array_length(p_nodes) > 0 THEN
    INSERT INTO internal_automation_nodes (id, flow_id, company_id, node_type, config_json, label, position_x, position_y)
    SELECT
      (elem->>'id')::uuid,
      p_flow_id,
      p_company_id,
      elem->>'node_type',
      COALESCE(elem->'config_json', '{}'::jsonb),
      elem->>'label',
      COALESCE((elem->>'position_x')::numeric, 0),
      COALESCE((elem->>'position_y')::numeric, 0)
    FROM jsonb_array_elements(p_nodes) AS elem;
  END IF;

  -- Insert new connections
  IF jsonb_array_length(p_connections) > 0 THEN
    INSERT INTO internal_automation_connections (id, flow_id, company_id, from_node_id, to_node_id, label)
    SELECT
      (elem->>'id')::uuid,
      p_flow_id,
      p_company_id,
      (elem->>'from_node_id')::uuid,
      (elem->>'to_node_id')::uuid,
      elem->>'label'
    FROM jsonb_array_elements(p_connections) AS elem;
  END IF;
END;
$$;
