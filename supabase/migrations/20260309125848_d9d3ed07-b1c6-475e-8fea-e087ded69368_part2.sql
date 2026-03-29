CREATE POLICY "super_admin_manage_tiers" ON public.referral_tiers FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));
