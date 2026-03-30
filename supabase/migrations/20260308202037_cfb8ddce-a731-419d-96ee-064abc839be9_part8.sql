-- 4. internal_agent_actions
CREATE TABLE IF NOT EXISTS public.internal_agent_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id       UUID NOT NULL REFERENCES public.internal_call_logs(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tool_name     TEXT NOT NULL,
  action_type   TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     UUID,
  input_params  JSONB DEFAULT '{}'::jsonb,
  result        JSONB DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  executed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
