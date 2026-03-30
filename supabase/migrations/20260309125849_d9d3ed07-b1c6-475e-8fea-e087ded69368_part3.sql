DROP POLICY IF EXISTS "authenticated_read_tiers" ON public.referral_tiers;
CREATE POLICY "authenticated_read_tiers" ON public.referral_tiers FOR SELECT TO authenticated
USING (true);
