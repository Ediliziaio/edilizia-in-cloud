-- P0: RLS policy for super_admin on sync_log
CREATE POLICY "Super admins can read sync logs"
ON public.google_calendar_sync_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- P2: Index on started_at for SyncLogs page performance
CREATE INDEX idx_gcsl_started_at ON public.google_calendar_sync_log (started_at DESC);