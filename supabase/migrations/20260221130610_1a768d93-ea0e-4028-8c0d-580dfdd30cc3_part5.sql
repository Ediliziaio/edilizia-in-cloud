-- Tasks: drop and recreate with visibility check
DROP POLICY IF EXISTS "Staff can view tasks if permitted" ON public.tasks;
