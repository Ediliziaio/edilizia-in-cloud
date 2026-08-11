-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Bug #2: 'fv' mancava dal CHECK tipo_documento → la firma Fotovoltaico
-- falliva SEMPRE con 500 (la migration fv_progetto_id non aveva esteso il CHECK).
ALTER TABLE public.signature_requests
  DROP CONSTRAINT IF EXISTS signature_requests_tipo_documento_check;
ALTER TABLE public.signature_requests
  ADD CONSTRAINT signature_requests_tipo_documento_check
  CHECK (tipo_documento = ANY (ARRAY['order','quote','sessione','odv','fv']));

-- Bug #10: fea_audit_insert WITH CHECK (true) permetteva a chiunque (anon con
-- API key) di inquinare il log probatorio. Lo restringo agli utenti autenticati
-- della stessa azienda (il client admin logga davvero: useFEASessioni.ts). Il
-- service_role delle edge continua a bypassare la RLS.
DROP POLICY IF EXISTS fea_audit_insert ON public.fea_audit_log;
CREATE POLICY fea_audit_insert ON public.fea_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
