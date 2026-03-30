ALTER TABLE public.platform_announcements DROP CONSTRAINT IF EXISTS platform_announcements_created_by_fkey,
  ADD CONSTRAINT platform_announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
