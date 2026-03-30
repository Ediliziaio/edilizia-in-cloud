-- 3. internal_call_logs
CREATE TABLE IF NOT EXISTS public.internal_call_logs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_id                    UUID NOT NULL REFERENCES public.internal_ai_agents(id) ON DELETE CASCADE,
  elevenlabs_conversation_id  TEXT,
  caller_phone                TEXT,
  contact_id                  UUID REFERENCES public.marketing_contacts(id),
  contact_name                TEXT,
  call_direction              TEXT NOT NULL DEFAULT 'inbound',
  campaign_id                 UUID REFERENCES public.internal_outbound_campaigns(id),
  duration_seconds            INTEGER NOT NULL DEFAULT 0,
  messages_count              INTEGER NOT NULL DEFAULT 0,
  status                      TEXT NOT NULL DEFAULT 'completed',
  outcome                     TEXT DEFAULT 'resolved',
  summary                     TEXT,
  transcript                  JSONB,
  metadata                    JSONB,
  started_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
