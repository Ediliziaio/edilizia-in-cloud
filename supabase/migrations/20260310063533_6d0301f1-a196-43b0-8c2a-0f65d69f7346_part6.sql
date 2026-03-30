-- Public access by token (for signing page - no auth needed)
DROP POLICY IF EXISTS "public_read_by_token" ON public.signature_requests;
CREATE POLICY "public_read_by_token"
  ON public.signature_requests FOR SELECT
  USING (true);
