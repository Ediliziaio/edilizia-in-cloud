DROP POLICY IF EXISTS "automation_log_select" ON public.automation_log;
CREATE POLICY "automation_log_select" ON public.automation_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.automation_rules ar
    WHERE ar.id = automation_log.rule_id
      AND (ar.is_template = true OR ar.company_id = public.get_my_company_id())
  )
);
