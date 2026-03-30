DROP POLICY IF EXISTS "Super admins can manage all opportunity notes" ON public.marketing_opportunity_notes;
CREATE POLICY "Super admins can manage all opportunity notes"
ON public.marketing_opportunity_notes FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));
