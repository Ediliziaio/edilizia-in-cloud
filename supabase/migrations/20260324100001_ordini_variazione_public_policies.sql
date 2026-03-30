-- Public (anon) access to ordini_variazione via firma_token
-- Allows clients to view and sign/reject their OdV without authentication

-- SELECT: allow anon to read OdV details using the firma_token link
DROP POLICY IF EXISTS "public_firma_odv_read" ON public.ordini_variazione;
CREATE POLICY "public_firma_odv_read" ON public.ordini_variazione
  FOR SELECT TO anon
  USING (firma_token IS NOT NULL);
