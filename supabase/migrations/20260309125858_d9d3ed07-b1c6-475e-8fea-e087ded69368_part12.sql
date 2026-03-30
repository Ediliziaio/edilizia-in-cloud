DROP POLICY IF EXISTS "super_admin_manage_ledger" ON public.referral_commission_ledger;
CREATE POLICY "super_admin_manage_ledger" ON public.referral_commission_ledger FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));
