-- Add only_assigned flag to staff_permissions
ALTER TABLE public.staff_permissions ADD COLUMN IF NOT EXISTS only_assigned BOOLEAN NOT NULL DEFAULT false;
