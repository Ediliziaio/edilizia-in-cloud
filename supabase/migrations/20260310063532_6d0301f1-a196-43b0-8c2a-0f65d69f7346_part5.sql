-- Company staff can read/write signature requests
DROP POLICY IF EXISTS "company_staff_signature_requests" ON public.signature_requests;
CREATE POLICY "company_staff_signature_requests"
  ON public.signature_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.id = auth.uid()
        AND p.company_id = signature_requests.company_id
        AND ur.role IN ('company_admin', 'company_staff')
    )
  );
