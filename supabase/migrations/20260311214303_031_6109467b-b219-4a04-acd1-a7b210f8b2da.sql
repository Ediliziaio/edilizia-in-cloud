ALTER TABLE public.bank_sync_logs ADD CONSTRAINT bank_sync_logs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;
