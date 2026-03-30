DROP POLICY IF EXISTS "service_role_manage_invoices" ON public.subscription_invoices;
CREATE POLICY "service_role_manage_invoices"
  ON public.subscription_invoices
  FOR ALL
  USING (auth.role() = 'service_role');
