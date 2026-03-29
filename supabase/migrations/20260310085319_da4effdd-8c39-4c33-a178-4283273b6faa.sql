-- 1. Add can_manage_marketing to super_admin_permissions
ALTER TABLE public.super_admin_permissions
ADD COLUMN IF NOT EXISTS can_manage_marketing boolean NOT NULL DEFAULT false;
