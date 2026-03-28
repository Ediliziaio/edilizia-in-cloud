CREATE POLICY "super_admin_manage_materials" ON public.partner_materials FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));
