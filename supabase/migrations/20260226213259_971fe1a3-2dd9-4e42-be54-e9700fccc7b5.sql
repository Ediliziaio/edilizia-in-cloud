-- P0: RLS policy for super_admin on sync_log
DROP POLICY IF EXISTS "Super admins can read sync logs" ON public.google_calendar_sync_log;
CREATE POLICY "Super admins can read sync logs"
ON public.google_calendar_sync_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));
