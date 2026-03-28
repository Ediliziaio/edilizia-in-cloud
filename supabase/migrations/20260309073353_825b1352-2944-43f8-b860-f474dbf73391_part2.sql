-- RLS policy for referrer self-access
CREATE POLICY "referrer_self_read" ON public.referrers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));
