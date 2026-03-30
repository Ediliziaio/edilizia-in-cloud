-- Authenticated users can read active announcements
DROP POLICY IF EXISTS "Authenticated users can read active announcements" ON public.platform_announcements;
CREATE POLICY "Authenticated users can read active announcements"
ON public.platform_announcements
FOR SELECT
TO authenticated
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));
