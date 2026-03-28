-- automation_log: execution log
CREATE TABLE IF NOT EXISTS public.automation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  trigger_data JSONB,
  esito TEXT NOT NULL,
  errore_msg TEXT,
  risultato JSONB,
  durata_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
