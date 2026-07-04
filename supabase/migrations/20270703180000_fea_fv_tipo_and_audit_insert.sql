-- Firma Elettronica — bug alti trovati in audit v2.

-- Bug #2: 'fv' mancava dal CHECK tipo_documento → la firma Fotovoltaico
-- falliva SEMPRE (500). La migration che aggiunse fv_progetto_id non estese il CHECK.
ALTER TABLE public.signature_requests
  DROP CONSTRAINT IF EXISTS signature_requests_tipo_documento_check;
ALTER TABLE public.signature_requests
  ADD CONSTRAINT signature_requests_tipo_documento_check
  CHECK (tipo_documento = ANY (ARRAY['order','quote','sessione','odv','fv']));

-- Bug #10: fea_audit_insert WITH CHECK (true) → chiunque con API key poteva
-- inquinare il log probatorio. Ristretto agli autenticati della stessa azienda
-- (il client admin logga davvero: useFEASessioni.ts); le edge usano service_role
-- e bypassano comunque la RLS.
DROP POLICY IF EXISTS fea_audit_insert ON public.fea_audit_log;
CREATE POLICY fea_audit_insert ON public.fea_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
