CREATE POLICY "co_pricing_select" ON public.platform_pricing
  FOR SELECT TO authenticated
  USING (true);
