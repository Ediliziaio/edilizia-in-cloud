-- INTERNAL AUTOMATION SYSTEM — Complete migration

-- 1. Main flows table
CREATE TABLE IF NOT EXISTS public.internal_automation_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Nuova Automazione',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','paused','archived')),
  trigger_type TEXT NOT NULL DEFAULT '',
  trigger_config JSONB NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL,
  updated_by UUID,
  total_runs INTEGER NOT NULL DEFAULT 0,
  successful_runs INTEGER NOT NULL DEFAULT 0,
  failed_runs INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
