
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS lockout_duration_minutes integer NOT NULL DEFAULT 30,
ADD COLUMN IF NOT EXISTS enforce_2fa_roles text[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS security_notifications jsonb DEFAULT '{"login_unknown_ip": false, "account_locked": false, "admin_permission_change": false}'::jsonb;
