-- Create a lightweight event table for trigger events (avoids pg_net dependency)
CREATE TABLE IF NOT EXISTS public.automation_trigger_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  trigger_event text NOT NULL,
  entity_id text NOT NULL,
  entity_type text NOT NULL DEFAULT 'contact',
  payload jsonb DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
