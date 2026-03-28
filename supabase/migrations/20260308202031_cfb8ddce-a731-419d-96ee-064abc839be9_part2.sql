-- 2. internal_outbound_campaigns (created before internal_call_logs because of FK)
CREATE TABLE public.internal_outbound_campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_id          UUID NOT NULL REFERENCES public.internal_ai_agents(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  campaign_type     TEXT NOT NULL DEFAULT 'custom_outreach',
  status            TEXT NOT NULL DEFAULT 'draft',
  target_type       TEXT NOT NULL DEFAULT 'contact_list',
  contact_ids       UUID[],
  filter_config     JSONB DEFAULT '{}'::jsonb,
  dynamic_vars      JSONB DEFAULT '{}'::jsonb,
  scheduled_at      TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  total_calls       INTEGER NOT NULL DEFAULT 0,
  calls_answered    INTEGER NOT NULL DEFAULT 0,
  calls_failed      INTEGER NOT NULL DEFAULT 0,
  calls_per_minute  INTEGER NOT NULL DEFAULT 3,
  created_by        UUID NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
