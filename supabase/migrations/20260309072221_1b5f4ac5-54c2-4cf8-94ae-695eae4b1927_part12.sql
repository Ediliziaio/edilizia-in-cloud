-- Users can see/create their own requests; admins can see all for their company
DROP POLICY IF EXISTS "Users manage own gdpr requests" ON public.gdpr_data_requests;
CREATE POLICY "Users manage own gdpr requests"
ON public.gdpr_data_requests FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  OR company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);
