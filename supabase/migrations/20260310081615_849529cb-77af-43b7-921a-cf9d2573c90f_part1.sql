DROP POLICY IF EXISTS "public_read_by_token" ON public.signature_requests;
CREATE POLICY "public_read_by_token" ON public.signature_requests
  FOR SELECT TO public
  USING (
    token IS NOT NULL 
    AND token = current_setting('request.header.x-signature-token', true)
  );
