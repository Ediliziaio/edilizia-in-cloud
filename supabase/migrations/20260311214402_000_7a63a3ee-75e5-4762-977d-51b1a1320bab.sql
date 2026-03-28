-- Fix tasks.assigned_to and orders.assigned_to to reference profiles(id) instead of auth.users(id)
-- so PostgREST joins to profiles still work. Profiles cascade-delete with auth.users anyway.

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey;
