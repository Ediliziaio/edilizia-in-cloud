-- SELECT for company members
DROP POLICY IF EXISTS "Company members can read own whatsapp_credits_log" ON public.whatsapp_credits_log;
CREATE POLICY "Company members can read own whatsapp_credits_log"
  ON public.whatsapp_credits_log
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
