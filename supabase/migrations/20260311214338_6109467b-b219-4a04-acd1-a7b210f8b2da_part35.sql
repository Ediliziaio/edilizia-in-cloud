ALTER TABLE public.platform_settings DROP CONSTRAINT IF EXISTS platform_settings_updated_by_fkey,
  ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
