DROP POLICY IF EXISTS "Super admins can manage all pipelines" ON public.marketing_pipelines;
CREATE POLICY "Super admins can manage all pipelines"
  ON public.marketing_pipelines FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
