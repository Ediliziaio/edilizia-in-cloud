ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_assigned_to_fkey,
  ADD CONSTRAINT tickets_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;
