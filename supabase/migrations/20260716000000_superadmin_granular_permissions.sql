-- Migration: Add granular permissions to super_admin_permissions table
-- Replaces binary on/off per module with fine-grained action-level permissions

ALTER TABLE public.super_admin_permissions
  ADD COLUMN IF NOT EXISTS billing_read        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_write       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS impersonation       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_management     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pricing_override    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_flags       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS audit_log_access    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bulk_actions        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_export         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS support_tickets     boolean NOT NULL DEFAULT false;

-- For existing super_admins (full access), set all granular perms to true
UPDATE public.super_admin_permissions
SET
  billing_read     = can_manage_plans,
  billing_write    = can_manage_plans,
  impersonation    = can_manage_companies,
  user_management  = can_manage_admins,
  pricing_override = can_manage_plans,
  feature_flags    = can_manage_companies,
  audit_log_access = can_view_platform_stats,
  bulk_actions     = can_manage_companies,
  data_export      = can_view_platform_stats,
  support_tickets  = can_manage_tickets
WHERE true;
