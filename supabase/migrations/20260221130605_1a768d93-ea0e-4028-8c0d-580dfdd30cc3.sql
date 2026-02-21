
-- Add assigned_to column to orders
ALTER TABLE public.orders ADD COLUMN assigned_to UUID REFERENCES public.profiles(id);

-- Add only_assigned flag to staff_permissions
ALTER TABLE public.staff_permissions ADD COLUMN only_assigned BOOLEAN NOT NULL DEFAULT false;

-- Create helper function for staff visibility check
CREATE OR REPLACE FUNCTION public.check_staff_visibility(_user_id uuid, _assigned_to uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _only_assigned boolean;
BEGIN
  IF has_role(_user_id, 'super_admin'::app_role) OR has_role(_user_id, 'company_admin'::app_role) THEN
    RETURN true;
  END IF;

  SELECT only_assigned INTO _only_assigned
  FROM public.staff_permissions
  WHERE user_id = _user_id;

  IF _only_assigned IS NULL OR _only_assigned = false THEN
    RETURN true;
  END IF;

  RETURN _assigned_to = _user_id;
END;
$$;

-- Orders: staff RLS policies
CREATE POLICY "Staff can view orders if permitted"
ON public.orders
FOR SELECT
USING (
  has_permission(auth.uid(), 'can_view_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
  AND check_staff_visibility(auth.uid(), assigned_to)
);

CREATE POLICY "Staff can manage orders if permitted"
ON public.orders
FOR ALL
USING (
  has_permission(auth.uid(), 'can_edit_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
  AND check_staff_visibility(auth.uid(), assigned_to)
);

-- Tasks: drop and recreate with visibility check
DROP POLICY IF EXISTS "Staff can view tasks if permitted" ON public.tasks;
DROP POLICY IF EXISTS "Staff can manage tasks if permitted" ON public.tasks;

CREATE POLICY "Staff can view tasks if permitted"
ON public.tasks
FOR SELECT
USING (
  has_permission(auth.uid(), 'can_view_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
  AND check_staff_visibility(auth.uid(), assigned_to)
);

CREATE POLICY "Staff can manage tasks if permitted"
ON public.tasks
FOR ALL
USING (
  has_permission(auth.uid(), 'can_edit_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
  AND check_staff_visibility(auth.uid(), assigned_to)
);

-- Appointments: drop and recreate with visibility check
DROP POLICY IF EXISTS "Staff can manage appointments if permitted" ON public.appointments;
DROP POLICY IF EXISTS "Staff can view appointments if permitted" ON public.appointments;

CREATE POLICY "Staff can view appointments if permitted"
ON public.appointments
FOR SELECT
USING (
  has_permission(auth.uid(), 'can_view_calendar'::text)
  AND company_id = get_user_company_id(auth.uid())
  AND check_staff_visibility(auth.uid(), assigned_to)
);

CREATE POLICY "Staff can manage appointments if permitted"
ON public.appointments
FOR ALL
USING (
  has_permission(auth.uid(), 'can_edit_orders'::text)
  AND company_id = get_user_company_id(auth.uid())
  AND check_staff_visibility(auth.uid(), assigned_to)
);
