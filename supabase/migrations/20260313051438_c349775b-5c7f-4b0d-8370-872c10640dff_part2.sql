-- ============================================================
-- 2. Composite index for documenti_fiscali list queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_documenti_fiscali_compound 
  ON public.documenti_fiscali(company_id, tipo, stato, data_emissione DESC);
