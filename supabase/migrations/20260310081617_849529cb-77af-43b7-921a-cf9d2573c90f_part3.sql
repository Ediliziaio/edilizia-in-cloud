DROP POLICY IF EXISTS "public_update_by_token" ON public.signature_requests;
CREATE POLICY "public_update_by_token" ON public.signature_requests
  FOR UPDATE TO public
  USING (
    status = 'pending' 
    AND token IS NOT NULL
    AND token = current_setting('request.header.x-signature-token', true)
  )
  WITH CHECK (status = 'signed');
