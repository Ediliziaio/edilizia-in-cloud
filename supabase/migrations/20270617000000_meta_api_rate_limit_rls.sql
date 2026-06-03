-- Hardening sicurezza: isolamento multi-azienda su meta_api_rate_limit.
--
-- La tabella traccia il rate-limit delle chiamate Meta per azienda
-- (company_id + contatori). Era SENZA RLS: un utente autenticato poteva
-- leggere i contatori di rate-limit di ALTRE aziende (gap di isolamento
-- multi-tenant — bassa sensibilità, nessun PII/dato finanziario, ma va chiuso
-- per coerenza con il resto delle tabelle company-scoped).

ALTER TABLE public.meta_api_rate_limit ENABLE ROW LEVEL SECURITY;

-- Ogni azienda accede solo ai propri contatori.
-- NB: le edge function scrivono con SERVICE_ROLE_KEY (BYPASSRLS), quindi
-- gli aggiornamenti server-side del rate-limit restano invariati.
DROP POLICY IF EXISTS meta_api_rate_limit_company ON public.meta_api_rate_limit;
CREATE POLICY meta_api_rate_limit_company
  ON public.meta_api_rate_limit
  FOR ALL
  TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
