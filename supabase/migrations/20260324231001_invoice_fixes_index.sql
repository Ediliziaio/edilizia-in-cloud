-- Index for the common case of filtering out deleted documents
CREATE INDEX IF NOT EXISTS idx_documenti_fiscali_deleted_at
  ON public.documenti_fiscali (company_id, deleted_at)
  WHERE deleted_at IS NULL;
