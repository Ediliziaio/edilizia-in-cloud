-- Add new role to enum
ALTER TYPE app_role ADD VALUE 'company_staff';

-- Create staff_permissions table
CREATE TABLE public.staff_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  can_view_dashboard boolean DEFAULT false,
  can_view_orders boolean DEFAULT false,
  can_edit_orders boolean DEFAULT false,
  can_view_warehouse boolean DEFAULT false,
  can_edit_warehouse boolean DEFAULT false,
  can_view_calendar boolean DEFAULT false,
  can_view_customers boolean DEFAULT false,
  can_edit_customers boolean DEFAULT false,
  can_view_employees boolean DEFAULT false,
  can_view_tickets boolean DEFAULT false,
  can_edit_tickets boolean DEFAULT false,
  can_view_forecast boolean DEFAULT false,
  can_view_settings boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(user_id, company_id)
);

-- Enable RLS
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;

-- RLS: Company admins can manage staff permissions
CREATE POLICY "Company admins can manage staff permissions"
  ON public.staff_permissions FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin'::app_role) AND
    company_id = get_user_company_id(auth.uid())
  );

-- RLS: Staff can view their own permissions
CREATE POLICY "Staff can view their own permissions"
  ON public.staff_permissions FOR SELECT
  USING (user_id = auth.uid());

-- RLS: Super admins can manage all staff permissions
CREATE POLICY "Super admins can manage all staff permissions"
  ON public.staff_permissions FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Helper function to check specific permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_perm boolean;
BEGIN
  -- Super admin and company admin have all permissions
  IF has_role(_user_id, 'super_admin'::app_role) OR has_role(_user_id, 'company_admin'::app_role) THEN
    RETURN true;
  END IF;
  
  -- Check if user is company_staff
  IF NOT has_role(_user_id, 'company_staff'::app_role) THEN
    RETURN false;
  END IF;
  
  -- Get specific permission
  EXECUTE format(
    'SELECT %I FROM public.staff_permissions WHERE user_id = $1',
    _permission
  ) INTO _has_perm USING _user_id;
  
  RETURN COALESCE(_has_perm, false);
END;
$$;

-- Trigger for updated_at
CREATE TRIGGER update_staff_permissions_updated_at
  BEFORE UPDATE ON public.staff_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();