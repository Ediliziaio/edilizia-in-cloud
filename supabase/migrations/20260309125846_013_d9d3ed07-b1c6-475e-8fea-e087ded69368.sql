CREATE POLICY "referrer_self_ledger" ON public.referral_commission_ledger FOR SELECT TO authenticated
USING (referrer_id IN (SELECT id FROM referrers WHERE user_id = auth.uid()));
