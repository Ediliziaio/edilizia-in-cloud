-- PDF firmato: il file con il timbro di firma su ogni pagina e il certificato in coda
-- (vedi _shared/pdfFirmato.ts), con la sua impronta e il codice di verifica.
-- Additiva, idempotente, istantanea.
ALTER TABLE public.signature_requests
  ADD COLUMN IF NOT EXISTS signed_pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS signed_pdf_hash TEXT,
  ADD COLUMN IF NOT EXISTS codice_verifica TEXT;

COMMENT ON COLUMN public.signature_requests.signed_pdf_path IS 'Percorso in quote-pdfs del PDF firmato (timbro + certificato)';
COMMENT ON COLUMN public.signature_requests.codice_verifica IS 'Codice XXXX-XXXX-XXXX stampato sul certificato: lega richiesta, documento e istante di firma';
