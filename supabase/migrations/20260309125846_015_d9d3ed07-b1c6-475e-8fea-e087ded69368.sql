-- Add INSERT policy for referrers on referral_payouts (self-request)
CREATE POLICY "referrer_self_insert_payout" ON public.referral_payouts FOR INSERT TO authenticated
WITH CHECK (referrer_id IN (SELECT id FROM referrers WHERE user_id = auth.uid()));
