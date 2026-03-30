-- Queue table for delayed automation steps
CREATE TABLE IF NOT EXISTS public.automation_queue (
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
