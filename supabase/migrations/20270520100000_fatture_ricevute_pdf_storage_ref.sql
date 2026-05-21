-- Persistenza sicura del file sorgente per OCR fatture/ricevute.
-- pdf_url puo' restare una signed URL temporanea per compatibilita UI immediata;
-- questi campi conservano invece il riferimento stabile a Storage.
ALTER TABLE public.fatture_ricevute
  ADD COLUMN IF NOT EXISTS pdf_storage_bucket text,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text;

CREATE INDEX IF NOT EXISTS idx_fatture_ricevute_pdf_storage
  ON public.fatture_ricevute(company_id, pdf_storage_bucket, pdf_storage_path)
  WHERE pdf_storage_path IS NOT NULL;
