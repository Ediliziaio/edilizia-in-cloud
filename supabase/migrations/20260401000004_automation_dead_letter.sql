-- Automation dead-letter queue: stores permanently-failed queue items after exhausting retries
CREATE TABLE IF NOT EXISTS public.automation_dead_letter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES public.automation_enrollments(id) ON DELETE SET NULL,
  node_id UUID,
  node_type TEXT,
  entity_id UUID,
  entity_type TEXT,
  context_json JSONB DEFAULT '{}',
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_dead_letter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_dead_letter_tenant" ON public.automation_dead_letter
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_automation_dead_letter_company
  ON public.automation_dead_letter(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_dead_letter_flow
  ON public.automation_dead_letter(flow_id);

CREATE INDEX IF NOT EXISTS idx_automation_dead_letter_unresolved
  ON public.automation_dead_letter(company_id) WHERE resolved_at IS NULL;
