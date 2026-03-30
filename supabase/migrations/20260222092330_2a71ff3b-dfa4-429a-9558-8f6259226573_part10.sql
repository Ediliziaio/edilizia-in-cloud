DROP POLICY IF EXISTS "Super admins can manage all pipeline stages" ON public.marketing_pipeline_stages;
CREATE POLICY "Super admins can manage all pipeline stages"
  ON public.marketing_pipeline_stages FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
