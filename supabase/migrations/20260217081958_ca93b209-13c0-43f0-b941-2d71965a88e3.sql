
-- Create admin audit log table
CREATE TABLE public.admin_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb,
  ip_address text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only super admins can read audit logs
CREATE POLICY "Super admins can view audit logs"
ON public.admin_audit_log
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Insert only via service role (edge functions), no direct insert policy for users
-- This ensures audit logs cannot be tampered with from the client

-- Index for efficient querying
CREATE INDEX idx_audit_log_created_at ON public.admin_audit_log (created_at DESC);
CREATE INDEX idx_audit_log_user_id ON public.admin_audit_log (user_id);
CREATE INDEX idx_audit_log_action ON public.admin_audit_log (action);
