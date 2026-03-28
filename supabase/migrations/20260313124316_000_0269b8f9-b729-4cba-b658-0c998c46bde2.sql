-- Task Automation Rules
CREATE TABLE public.task_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}'::jsonb,
  conditions JSONB DEFAULT '[]'::jsonb,
  action_title TEXT NOT NULL,
  action_notes TEXT,
  action_priority TEXT DEFAULT 'normale',
  action_assign_to TEXT DEFAULT 'entity_assignee',
  action_due_days INTEGER DEFAULT 1,
  action_category TEXT DEFAULT 'generale',
  executions_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);
