-- Super admin policy for quote_templates
DROP POLICY IF EXISTS "super_admin_manage_all_templates" ON public.quote_templates;
CREATE POLICY "super_admin_manage_all_templates"
ON public.quote_templates FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
