
-- Queue table for delayed automation steps
CREATE TABLE public.automation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.automation_enrollments(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  current_node_id uuid NOT NULL REFERENCES public.automation_nodes(id) ON DELETE CASCADE,
  entity_id text NOT NULL,
  entity_type text NOT NULL DEFAULT 'contact',
  status text NOT NULL DEFAULT 'pending',
  execute_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  context_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient polling
CREATE INDEX idx_automation_queue_pending ON public.automation_queue (execute_at) WHERE status = 'pending';
CREATE INDEX idx_automation_queue_company ON public.automation_queue (company_id);

-- Enable RLS
ALTER TABLE public.automation_queue ENABLE ROW LEVEL SECURITY;

-- Only service role can manage the queue (edge functions use service_role)
CREATE POLICY "Service role manages automation queue"
  ON public.automation_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Company admins can view their queue
CREATE POLICY "Company users can view own queue"
  ON public.automation_queue
  FOR SELECT
  TO authenticated
  USING (company_id IN (
    SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
  ));
