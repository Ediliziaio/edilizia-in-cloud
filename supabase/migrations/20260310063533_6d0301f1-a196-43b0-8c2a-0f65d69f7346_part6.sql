-- Public access by token (for signing page - no auth needed)
CREATE POLICY "public_read_by_token"
  ON public.signature_requests FOR SELECT
  USING (true);
