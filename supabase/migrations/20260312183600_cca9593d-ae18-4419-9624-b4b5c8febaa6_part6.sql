-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_documenti_company ON public.documenti_fiscali(company_id);
