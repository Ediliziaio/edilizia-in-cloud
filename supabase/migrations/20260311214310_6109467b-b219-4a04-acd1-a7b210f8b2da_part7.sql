ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_assigned_to_fkey,
  ADD CONSTRAINT orders_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
