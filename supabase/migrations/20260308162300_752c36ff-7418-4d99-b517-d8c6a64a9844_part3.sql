DROP POLICY IF EXISTS "Company users manage loss reasons" ON public.opportunity_loss_reasons;
CREATE POLICY "Company users manage loss reasons"
  ON public.opportunity_loss_reasons FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );
