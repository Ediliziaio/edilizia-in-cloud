DROP POLICY IF EXISTS "lead_forms_tenant_all" ON public.lead_forms;
DROP POLICY IF EXISTS "lead_forms_tenant_select" ON public.lead_forms;
DROP POLICY IF EXISTS "lead_forms_tenant_insert" ON public.lead_forms;
DROP POLICY IF EXISTS "lead_forms_tenant_update" ON public.lead_forms;
DROP POLICY IF EXISTS "lead_forms_tenant_delete" ON public.lead_forms;

CREATE POLICY "lead_forms_tenant_select"
ON public.lead_forms FOR SELECT TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND (
    has_permission(auth.uid(), 'can_view_settings'::text)
    OR has_permission(auth.uid(), 'can_view_settings_customization'::text)
    OR has_permission(auth.uid(), 'can_edit_settings_customization'::text)
  )
);

CREATE POLICY "lead_forms_tenant_insert"
ON public.lead_forms FOR INSERT TO authenticated
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND has_permission(auth.uid(), 'can_edit_settings_customization'::text)
);

CREATE POLICY "lead_forms_tenant_update"
ON public.lead_forms FOR UPDATE TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND has_permission(auth.uid(), 'can_edit_settings_customization'::text)
)
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND has_permission(auth.uid(), 'can_edit_settings_customization'::text)
);

CREATE POLICY "lead_forms_tenant_delete"
ON public.lead_forms FOR DELETE TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND has_permission(auth.uid(), 'can_edit_settings_customization'::text)
);
