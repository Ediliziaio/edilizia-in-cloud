-- P2: Index on started_at for SyncLogs page performance
CREATE INDEX IF NOT EXISTS idx_gcsl_started_at ON public.google_calendar_sync_log (started_at DESC);
