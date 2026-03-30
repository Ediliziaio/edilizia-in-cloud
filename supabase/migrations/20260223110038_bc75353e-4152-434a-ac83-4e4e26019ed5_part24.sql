-- 5. automation_execution_log - Log esecuzioni
CREATE TABLE IF NOT EXISTS public.automation_execution_log (
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
