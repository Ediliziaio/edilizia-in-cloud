-- Allow referrers to see their own payouts
CREATE POLICY "referrer_self_payouts" ON public.referral_payouts
  FOR SELECT TO authenticated
  USING (
    referrer_id IN (SELECT id FROM public.referrers WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
