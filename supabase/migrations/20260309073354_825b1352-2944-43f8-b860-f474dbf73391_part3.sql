-- Allow referrers to see their own referral_companies
CREATE POLICY "referrer_self_companies" ON public.referral_companies
  FOR SELECT TO authenticated
  USING (
    referrer_id IN (SELECT id FROM public.referrers WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
