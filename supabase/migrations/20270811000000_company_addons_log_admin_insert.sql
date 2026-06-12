-- L'audit log best-effort del white-label (SettingsBranding) falliva con
-- violazione RLS per i company_admin: esisteva solo la policy super_admin.
DROP POLICY IF EXISTS company_admins_insert_own_addons_log ON public.company_addons_log;
CREATE POLICY company_admins_insert_own_addons_log
ON public.company_addons_log
FOR INSERT TO authenticated
WITH CHECK (
  performed_by = (SELECT auth.uid())
  AND has_role((SELECT auth.uid()), 'company_admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.company_id = company_addons_log.company_id
  )
);
