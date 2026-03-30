ALTER TABLE public.cs_tasks DROP CONSTRAINT IF EXISTS cs_tasks_assigned_to_fkey,
  ADD CONSTRAINT cs_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
