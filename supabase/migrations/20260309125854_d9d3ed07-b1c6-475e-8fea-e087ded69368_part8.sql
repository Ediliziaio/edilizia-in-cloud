DROP POLICY IF EXISTS "super_admin_manage_clicks" ON public.referral_clicks;
CREATE POLICY "super_admin_manage_clicks" ON public.referral_clicks FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));
