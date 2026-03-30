-- Task Automation Log
CREATE TABLE IF NOT EXISTS public.task_automation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.task_automation_rules(id) ON DELETE CASCADE,
  task_created_id UUID REFERENCES public.tasks(id),
  trigger_data JSONB,
  success BOOLEAN DEFAULT true,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
