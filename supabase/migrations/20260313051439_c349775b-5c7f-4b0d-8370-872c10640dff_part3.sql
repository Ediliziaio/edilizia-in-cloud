-- ============================================================
-- 3. sdi_log index on sdi_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sdi_log_sdi_id ON public.sdi_log(sdi_id);
