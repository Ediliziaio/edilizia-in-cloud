CREATE POLICY "Super admins can manage all marketing tags"
ON public.marketing_tags FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));
