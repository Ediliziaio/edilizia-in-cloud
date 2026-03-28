-- Fix 4: Add can_view_users column
ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_view_users boolean NOT NULL DEFAULT false;
