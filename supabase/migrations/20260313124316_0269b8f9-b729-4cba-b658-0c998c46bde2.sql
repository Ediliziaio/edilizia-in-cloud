
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

-- Task Automation Log
CREATE TABLE public.task_automation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.task_automation_rules(id) ON DELETE CASCADE,
  task_created_id UUID REFERENCES public.tasks(id),
  trigger_data JSONB,
  success BOOLEAN DEFAULT true,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_task_automation_rules_company ON public.task_automation_rules(company_id) WHERE is_active = true;
CREATE INDEX idx_task_automation_rules_trigger ON public.task_automation_rules(trigger_type) WHERE is_active = true;
CREATE INDEX idx_task_automation_log_rule ON public.task_automation_log(rule_id);

-- RLS
ALTER TABLE public.task_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_automation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_automation_rules_select" ON public.task_automation_rules
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "task_automation_rules_insert" ON public.task_automation_rules
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "task_automation_rules_update" ON public.task_automation_rules
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "task_automation_rules_delete" ON public.task_automation_rules
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "task_automation_log_select" ON public.task_automation_log
  FOR SELECT TO authenticated
  USING (
    rule_id IN (
      SELECT id FROM public.task_automation_rules
      WHERE company_id = public.get_my_company_id()
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "task_automation_log_insert" ON public.task_automation_log
  FOR INSERT TO authenticated
  WITH CHECK (true);
