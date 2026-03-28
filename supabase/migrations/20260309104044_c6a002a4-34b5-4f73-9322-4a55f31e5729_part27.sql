-- Anon policy for public signature page
CREATE POLICY "q_anon_sel" ON public.quotes FOR SELECT TO anon
  USING (signature_token IS NOT NULL AND status IN ('inviata', 'accettata', 'rifiutata', 'scaduta'));
