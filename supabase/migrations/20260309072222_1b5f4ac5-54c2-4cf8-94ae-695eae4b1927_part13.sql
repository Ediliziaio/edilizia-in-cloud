-- Users manage own consents
DROP POLICY IF EXISTS "Users manage own consents" ON public.gdpr_consents;
CREATE POLICY "Users manage own consents"
ON public.gdpr_consents FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  OR company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);
