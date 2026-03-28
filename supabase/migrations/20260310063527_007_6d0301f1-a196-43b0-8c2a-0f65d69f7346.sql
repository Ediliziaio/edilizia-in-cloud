CREATE POLICY "public_update_by_token"
  ON public.signature_requests FOR UPDATE
  USING (status = 'pending')
  WITH CHECK (status = 'signed');
