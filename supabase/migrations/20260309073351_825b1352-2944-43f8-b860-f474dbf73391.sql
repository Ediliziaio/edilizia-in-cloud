
-- Add user_id to referrers so partners can log in and view their data
ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_referrers_user_id ON public.referrers(user_id);

-- RLS policy for referrer self-access
CREATE POLICY "referrer_self_read" ON public.referrers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- Allow referrers to see their own referral_companies
CREATE POLICY "referrer_self_companies" ON public.referral_companies
  FOR SELECT TO authenticated
  USING (
    referrer_id IN (SELECT id FROM public.referrers WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Allow referrers to see their own payouts
CREATE POLICY "referrer_self_payouts" ON public.referral_payouts
  FOR SELECT TO authenticated
  USING (
    referrer_id IN (SELECT id FROM public.referrers WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
