-- Company members can read their own
DROP POLICY IF EXISTS "company_read" ON public.whatsapp_credits;
CREATE POLICY "company_read" ON public.whatsapp_credits
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
