DROP POLICY IF EXISTS "Authenticated can read active email_pricing" ON public.email_pricing;
CREATE POLICY "Authenticated can read active email_pricing"
  ON public.email_pricing FOR SELECT TO authenticated
  USING (is_active = true);
