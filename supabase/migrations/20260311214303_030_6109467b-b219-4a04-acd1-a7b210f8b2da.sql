-- bank_sync_logs.triggered_by
ALTER TABLE public.bank_sync_logs DROP CONSTRAINT IF EXISTS bank_sync_logs_triggered_by_fkey;
