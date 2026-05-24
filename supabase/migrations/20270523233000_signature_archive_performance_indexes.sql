-- Stabilizza l'archivio Firma Elettronica:
-- - dashboard FEA: filtro per azienda + ordine per data
-- - preventivi legacy: solo record firmabili con token

CREATE INDEX IF NOT EXISTS idx_signature_requests_company_created_at
  ON public.signature_requests(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quotes_company_status_signature_created_at
  ON public.quotes(company_id, status, created_at DESC)
  WHERE signature_token IS NOT NULL;
