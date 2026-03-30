DROP POLICY IF EXISTS "Super admins manage bank providers" ON public.bank_provider_configs;
CREATE POLICY "Super admins manage bank providers" ON public.bank_provider_configs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
