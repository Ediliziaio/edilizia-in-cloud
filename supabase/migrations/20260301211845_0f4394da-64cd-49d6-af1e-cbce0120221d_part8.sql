-- Super admins can read health metrics
DROP POLICY IF EXISTS "Super admins read health metrics" ON public.system_health_metrics;
CREATE POLICY "Super admins read health metrics"
ON public.system_health_metrics FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));
