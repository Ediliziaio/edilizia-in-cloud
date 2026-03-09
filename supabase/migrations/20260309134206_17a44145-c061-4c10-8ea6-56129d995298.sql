
-- INTERNAL AUTOMATION SYSTEM — Complete migration

-- 1. Main flows table
CREATE TABLE IF NOT EXISTS public.internal_automation_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Nuova Automazione',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','paused','archived')),
  trigger_type TEXT NOT NULL DEFAULT '',
  trigger_config JSONB NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL,
  updated_by UUID,
  total_runs INTEGER NOT NULL DEFAULT 0,
  successful_runs INTEGER NOT NULL DEFAULT 0,
  failed_runs INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iaf_company ON public.internal_automation_flows(company_id);
CREATE INDEX IF NOT EXISTS idx_iaf_status ON public.internal_automation_flows(company_id, status);

-- 2. Nodes
CREATE TABLE IF NOT EXISTS public.internal_automation_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES internal_automation_flows(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL CHECK (node_type IN ('trigger','action','condition','delay')),
  config_json JSONB NOT NULL DEFAULT '{}',
  label TEXT,
  position_x FLOAT NOT NULL DEFAULT 0,
  position_y FLOAT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ian_flow ON public.internal_automation_nodes(flow_id);

-- 3. Connections
CREATE TABLE IF NOT EXISTS public.internal_automation_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES internal_automation_flows(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_node_id UUID NOT NULL REFERENCES internal_automation_nodes(id) ON DELETE CASCADE,
  to_node_id UUID NOT NULL REFERENCES internal_automation_nodes(id) ON DELETE CASCADE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iac_flow ON public.internal_automation_connections(flow_id);

-- 4. Enrollments
CREATE TABLE IF NOT EXISTS public.internal_automation_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES internal_automation_flows(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL DEFAULT 'order',
  entity_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','failed','cancelled')),
  current_node_id UUID REFERENCES internal_automation_nodes(id),
  context_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iae_flow ON public.internal_automation_enrollments(flow_id);
CREATE INDEX IF NOT EXISTS idx_iae_status ON public.internal_automation_enrollments(status);

-- 5. Queue
CREATE TABLE IF NOT EXISTS public.internal_automation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES internal_automation_enrollments(id) ON DELETE CASCADE,
  flow_id UUID NOT NULL REFERENCES internal_automation_flows(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES internal_automation_nodes(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'order',
  execute_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  context_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iaq_pending ON public.internal_automation_queue(status, execute_at) WHERE status = 'pending';

-- 6. Execution log
CREATE TABLE IF NOT EXISTS public.internal_automation_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES internal_automation_flows(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES internal_automation_enrollments(id) ON DELETE SET NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  node_id UUID REFERENCES internal_automation_nodes(id) ON DELETE SET NULL,
  node_type TEXT,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','error','skipped')),
  input_json JSONB,
  output_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iael_flow ON public.internal_automation_execution_log(flow_id);
CREATE INDEX IF NOT EXISTS idx_iael_company ON public.internal_automation_execution_log(company_id);

-- RLS
ALTER TABLE public.internal_automation_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_automation_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_automation_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_automation_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_automation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_automation_execution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins manage internal automation flows" ON public.internal_automation_flows FOR ALL USING (has_role(auth.uid(), 'company_admin') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Staff view internal automation flows" ON public.internal_automation_flows FOR SELECT USING (has_permission(auth.uid(), 'can_view_settings') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Super admins manage all internal automation flows" ON public.internal_automation_flows FOR ALL USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company admins manage internal automation nodes" ON public.internal_automation_nodes FOR ALL USING (has_role(auth.uid(), 'company_admin') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Staff view internal automation nodes" ON public.internal_automation_nodes FOR SELECT USING (has_permission(auth.uid(), 'can_view_settings') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Super admins manage all internal automation nodes" ON public.internal_automation_nodes FOR ALL USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company admins manage internal automation connections" ON public.internal_automation_connections FOR ALL USING (has_role(auth.uid(), 'company_admin') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Staff view internal automation connections" ON public.internal_automation_connections FOR SELECT USING (has_permission(auth.uid(), 'can_view_settings') AND company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Super admins manage all internal automation connections" ON public.internal_automation_connections FOR ALL USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company users view internal automation enrollments" ON public.internal_automation_enrollments FOR SELECT USING (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Super admins manage all internal automation enrollments" ON public.internal_automation_enrollments FOR ALL USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company users view internal automation queue" ON public.internal_automation_queue FOR SELECT USING (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Super admins manage all internal automation queue" ON public.internal_automation_queue FOR ALL USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company users view internal automation execution log" ON public.internal_automation_execution_log FOR SELECT USING (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Super admins manage all internal automation execution log" ON public.internal_automation_execution_log FOR ALL USING (has_role(auth.uid(), 'super_admin'));

-- Trigger helper function
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
        );
      END IF;
    END IF;

    UPDATE internal_automation_flows SET total_runs = total_runs + 1, last_run_at = now() WHERE id = v_flow.flow_id;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- DB Triggers (no WHEN clause referencing enum status directly)
CREATE TRIGGER trg_internal_auto_order_created
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('order_created', 'order');

CREATE TRIGGER trg_internal_auto_order_updated
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('order_updated', 'order');

CREATE TRIGGER trg_internal_auto_ticket_created
  AFTER INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('ticket_created', 'ticket');

CREATE TRIGGER trg_internal_auto_ticket_updated
  AFTER UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('ticket_updated', 'ticket');

CREATE TRIGGER trg_internal_auto_task_created
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('task_created', 'task');

CREATE TRIGGER trg_internal_auto_task_updated
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('task_updated', 'task');

CREATE TRIGGER trg_internal_auto_stock_updated
  AFTER UPDATE ON public.warehouse_stock
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('stock_updated', 'warehouse_stock');

CREATE TRIGGER trg_internal_auto_cost_created
  AFTER INSERT ON public.company_costs
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('cost_created', 'company_cost');

CREATE TRIGGER trg_internal_auto_appointment_created
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('appointment_created', 'appointment');

CREATE TRIGGER trg_internal_auto_appointment_updated
  AFTER UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('appointment_updated', 'appointment');
