-- Platform pricing: SuperAdmin full, companies read
DROP POLICY IF EXISTS "sa_pricing_all" ON public.platform_pricing;
CREATE POLICY "sa_pricing_all" ON public.platform_pricing
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));
