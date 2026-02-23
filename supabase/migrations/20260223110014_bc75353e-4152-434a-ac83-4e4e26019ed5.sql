
-- =============================================
-- Automation Builder - Visual Marketing Flows
-- =============================================

-- 1. automation_flows - Definizione del flusso
CREATE TABLE public.automation_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Nuova Automazione',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID NOT NULL,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their automation flows"
  ON public.automation_flows FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view automation flows if permitted"
  ON public.automation_flows FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_marketing'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all automation flows"
  ON public.automation_flows FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_automation_flows_company ON public.automation_flows(company_id, status);

-- 2. automation_nodes - Nodi del builder
CREATE TABLE public.automation_nodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL CHECK (node_type IN ('trigger', 'action', 'condition', 'delay', 'goal')),
  position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  label TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their automation nodes"
  ON public.automation_nodes FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view automation nodes if permitted"
  ON public.automation_nodes FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_marketing'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all automation nodes"
  ON public.automation_nodes FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_automation_nodes_flow ON public.automation_nodes(flow_id);

-- 3. automation_connections - Connessioni tra nodi
CREATE TABLE public.automation_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_node_id UUID NOT NULL REFERENCES public.automation_nodes(id) ON DELETE CASCADE,
  to_node_id UUID NOT NULL REFERENCES public.automation_nodes(id) ON DELETE CASCADE,
  label TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their automation connections"
  ON public.automation_connections FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view automation connections if permitted"
  ON public.automation_connections FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_marketing'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all automation connections"
  ON public.automation_connections FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_automation_connections_flow ON public.automation_connections(flow_id);

-- 4. automation_enrollments - Iscrizioni contatto/opportunità
CREATE TABLE public.automation_enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  flow_version INTEGER NOT NULL DEFAULT 1,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contact', 'opportunity', 'appointment')),
  entity_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'canceled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their automation enrollments"
  ON public.automation_enrollments FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view automation enrollments if permitted"
  ON public.automation_enrollments FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_marketing'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all automation enrollments"
  ON public.automation_enrollments FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_automation_enrollments_flow ON public.automation_enrollments(flow_id, status);

-- 5. automation_execution_log - Log esecuzioni
CREATE TABLE public.automation_execution_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES public.automation_enrollments(id) ON DELETE SET NULL,
  node_id UUID REFERENCES public.automation_nodes(id) ON DELETE SET NULL,
  node_type TEXT,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'skipped')),
  input_json JSONB,
  output_json JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_execution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can view their automation execution logs"
  ON public.automation_execution_log FOR SELECT
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view automation execution logs if permitted"
  ON public.automation_execution_log FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_marketing'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all automation execution logs"
  ON public.automation_execution_log FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_automation_execution_log_flow ON public.automation_execution_log(flow_id, created_at DESC);
CREATE INDEX idx_automation_execution_log_enrollment ON public.automation_execution_log(enrollment_id);

-- Trigger per updated_at
CREATE TRIGGER update_automation_flows_updated_at
  BEFORE UPDATE ON public.automation_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_automation_nodes_updated_at
  BEFORE UPDATE ON public.automation_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_automation_enrollments_updated_at
  BEFORE UPDATE ON public.automation_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
