ALTER TABLE public.work_logs DROP CONSTRAINT IF EXISTS work_logs_approved_by_fkey,
  ADD CONSTRAINT work_logs_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
