-- 4. Add index on bank_sync_logs(status)
CREATE INDEX IF NOT EXISTS idx_bank_sync_logs_status ON public.bank_sync_logs(status);
