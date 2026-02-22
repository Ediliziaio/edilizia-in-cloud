-- Add marketing permission columns to staff_permissions
ALTER TABLE public.staff_permissions 
ADD COLUMN IF NOT EXISTS can_view_marketing boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS can_edit_marketing boolean NOT NULL DEFAULT false;