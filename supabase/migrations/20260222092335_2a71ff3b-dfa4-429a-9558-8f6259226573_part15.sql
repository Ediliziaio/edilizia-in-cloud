DROP POLICY IF EXISTS "Super admins can manage all opportunities" ON public.marketing_opportunities;
CREATE POLICY "Super admins can manage all opportunities"
  ON public.marketing_opportunities FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));
