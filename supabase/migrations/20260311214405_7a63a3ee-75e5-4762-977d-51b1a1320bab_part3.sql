ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_assigned_to_fkey,
  ADD CONSTRAINT orders_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;
