-- 3. automation_connections - Connessioni tra nodi
CREATE TABLE IF NOT EXISTS public.automation_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_node_id UUID NOT NULL REFERENCES public.automation_nodes(id) ON DELETE CASCADE,
  to_node_id UUID NOT NULL REFERENCES public.automation_nodes(id) ON DELETE CASCADE,
  label TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
