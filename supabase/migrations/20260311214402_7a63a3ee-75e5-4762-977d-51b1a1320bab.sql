
-- Fix tasks.assigned_to and orders.assigned_to to reference profiles(id) instead of auth.users(id)
-- so PostgREST joins to profiles still work. Profiles cascade-delete with auth.users anyway.

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_assigned_to_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;
