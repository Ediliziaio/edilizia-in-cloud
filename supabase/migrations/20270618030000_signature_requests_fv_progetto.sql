-- Firma elettronica (FEA) per il preventivo Fotovoltaico.
-- Aggancia signature_requests al preventivo FV (fv_progetti) con una colonna
-- dedicata, coerente con order_id / quote_id / sessione_id già presenti.
-- Additiva e idempotente: NON tocca i tipi documento esistenti.
--
-- ⚠️  Sistema di firma a valore legale: rivedere prima del deploy.

ALTER TABLE public.signature_requests
  ADD COLUMN IF NOT EXISTS fv_progetto_id UUID REFERENCES public.fv_progetti(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_signature_requests_fv_progetto
  ON public.signature_requests(fv_progetto_id)
  WHERE fv_progetto_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signature_requests_company_fv
  ON public.signature_requests(company_id, fv_progetto_id)
  WHERE fv_progetto_id IS NOT NULL;
