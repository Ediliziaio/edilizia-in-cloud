-- UPDATE: allow anon to approve/reject only when status is still 'in_attesa'
-- USING  = checks the OLD row (must be in_attesa before the update)
-- WITH CHECK = validates the NEW row (must become approvato or rifiutato)
CREATE POLICY "public_firma_odv_update" ON public.ordini_variazione
  FOR UPDATE TO anon
  USING (firma_token IS NOT NULL AND status = 'in_attesa')
  WITH CHECK (firma_token IS NOT NULL AND status IN ('approvato', 'rifiutato'));
