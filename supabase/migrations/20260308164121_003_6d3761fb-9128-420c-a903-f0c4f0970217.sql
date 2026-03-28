-- RLS: only super_admin can modify
CREATE POLICY "Super admins can manage ai_subscriptions"
  ON public.ai_subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
