DROP POLICY IF EXISTS "referrer_self_clicks" ON public.referral_clicks;
CREATE POLICY "referrer_self_clicks" ON public.referral_clicks FOR SELECT TO authenticated
USING (referrer_id IN (SELECT id FROM referrers WHERE user_id = auth.uid()));
