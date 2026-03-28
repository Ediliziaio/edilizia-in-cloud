CREATE INDEX IF NOT EXISTS idx_documenti_fiscali_ordine
  ON public.documenti_fiscali(ordine_id) WHERE ordine_id IS NOT NULL;
