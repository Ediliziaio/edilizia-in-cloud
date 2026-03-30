DROP POLICY IF EXISTS "Super admins can manage all bank accounts" ON public.bank_accounts;
CREATE POLICY "Super admins can manage all bank accounts" ON public.bank_accounts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
