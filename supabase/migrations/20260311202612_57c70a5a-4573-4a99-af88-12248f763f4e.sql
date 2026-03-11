
ALTER TABLE public.super_admin_permissions
  ADD COLUMN IF NOT EXISTS platform_role TEXT DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT;
