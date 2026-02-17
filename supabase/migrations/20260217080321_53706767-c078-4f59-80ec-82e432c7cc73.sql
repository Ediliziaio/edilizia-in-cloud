
-- Create super_admin_permissions table
CREATE TABLE public.super_admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  can_manage_companies boolean NOT NULL DEFAULT true,
  can_manage_plans boolean NOT NULL DEFAULT true,
  can_manage_tickets boolean NOT NULL DEFAULT true,
  can_manage_referrals boolean NOT NULL DEFAULT true,
  can_manage_admins boolean NOT NULL DEFAULT true,
  can_view_platform_stats boolean NOT NULL DEFAULT true,
  allowed_company_ids uuid[] DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.super_admin_permissions ENABLE ROW LEVEL SECURITY;

-- Only super admins can manage their own permissions
CREATE POLICY "Super admins can view all permissions"
ON public.super_admin_permissions
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage permissions"
ON public.super_admin_permissions
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));
