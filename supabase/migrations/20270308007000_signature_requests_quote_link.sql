-- Collega le richieste FEA anche ai preventivi.
-- Il codice applicativo supportava gia tipo_documento='quote', ma mancava
-- il riferimento strutturale a public.quotes.

ALTER TABLE public.signature_requests
  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_signature_requests_quote
  ON public.signature_requests(quote_id);

CREATE INDEX IF NOT EXISTS idx_signature_requests_company_quote
  ON public.signature_requests(company_id, quote_id)
  WHERE quote_id IS NOT NULL;
