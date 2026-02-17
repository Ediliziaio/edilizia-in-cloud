
-- 1. Create company_activity_log table
CREATE TABLE public.company_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_activity_log_company_id ON public.company_activity_log(company_id);
CREATE INDEX idx_company_activity_log_created_at ON public.company_activity_log(created_at DESC);
CREATE INDEX idx_company_activity_log_action ON public.company_activity_log(action);

-- 2. Enable RLS
ALTER TABLE public.company_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS: company admins can read their own company logs
CREATE POLICY "Company admins can view their activity logs"
ON public.company_activity_log
FOR SELECT
USING (
  has_role(auth.uid(), 'company_admin'::app_role)
  AND company_id = get_user_company_id(auth.uid())
);

-- RLS: super admins can read all
CREATE POLICY "Super admins can view all activity logs"
ON public.company_activity_log
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- RLS: staff with settings permission can view
CREATE POLICY "Staff can view activity logs if permitted"
ON public.company_activity_log
FOR SELECT
USING (
  has_permission(auth.uid(), 'can_view_settings'::text)
  AND company_id = get_user_company_id(auth.uid())
);

-- 3. Create logging function (SECURITY DEFINER to bypass RLS for inserts)
CREATE OR REPLACE FUNCTION public.log_company_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _user_id uuid;
  _action text;
  _target_type text;
  _target_id text;
  _details jsonb;
BEGIN
  _user_id := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);

  -- Determine action and details based on TG_TABLE_NAME and TG_OP
  CASE TG_TABLE_NAME

    WHEN 'orders' THEN
      _target_type := 'order';
      IF TG_OP = 'INSERT' THEN
        _company_id := NEW.company_id;
        _action := 'create_order';
        _target_id := NEW.id::text;
        _details := jsonb_build_object('description', NEW.description, 'order_code', NEW.order_code);
      ELSIF TG_OP = 'UPDATE' THEN
        _company_id := NEW.company_id;
        _action := 'update_order';
        _target_id := NEW.id::text;
        _details := jsonb_build_object('description', NEW.description, 'order_code', NEW.order_code);
      ELSIF TG_OP = 'DELETE' THEN
        _company_id := OLD.company_id;
        _action := 'delete_order';
        _target_id := OLD.id::text;
        _details := jsonb_build_object('description', OLD.description, 'order_code', OLD.order_code);
      END IF;

    WHEN 'order_status_history' THEN
      _target_type := 'order';
      _action := 'update_order_status';
      _target_id := NEW.order_id::text;
      -- Get company_id from the order
      SELECT o.company_id INTO _company_id FROM orders o WHERE o.id = NEW.order_id;
      -- Get status name
      _details := jsonb_build_object(
        'status_id', NEW.status_id::text
      );

    WHEN 'suppliers' THEN
      _target_type := 'supplier';
      IF TG_OP = 'INSERT' THEN
        _company_id := NEW.company_id;
        _action := 'create_supplier';
        _target_id := NEW.id::text;
        _details := jsonb_build_object('name', NEW.name);
      ELSIF TG_OP = 'UPDATE' THEN
        _company_id := NEW.company_id;
        _action := 'update_supplier';
        _target_id := NEW.id::text;
        _details := jsonb_build_object('name', NEW.name);
      ELSIF TG_OP = 'DELETE' THEN
        _company_id := OLD.company_id;
        _action := 'delete_supplier';
        _target_id := OLD.id::text;
        _details := jsonb_build_object('name', OLD.name);
      END IF;

    WHEN 'employees' THEN
      _target_type := 'employee';
      IF TG_OP = 'INSERT' THEN
        _company_id := NEW.company_id;
        _action := 'create_employee';
        _target_id := NEW.id::text;
        _details := jsonb_build_object('name', NEW.first_name || ' ' || NEW.last_name);
      ELSIF TG_OP = 'UPDATE' THEN
        _company_id := NEW.company_id;
        _action := 'update_employee';
        _target_id := NEW.id::text;
        _details := jsonb_build_object('name', NEW.first_name || ' ' || NEW.last_name);
      END IF;

    WHEN 'profiles' THEN
      _target_type := 'customer';
      _company_id := COALESCE(
        CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END,
        NULL
      );
      IF _company_id IS NULL THEN
        -- Skip logging if no company_id (not a company customer)
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
      END IF;
      IF TG_OP = 'INSERT' THEN
        _action := 'create_customer';
        _target_id := NEW.id::text;
        _details := jsonb_build_object('name', NEW.first_name || ' ' || NEW.last_name);
      ELSIF TG_OP = 'UPDATE' THEN
        _action := 'update_customer';
        _target_id := NEW.id::text;
        _details := jsonb_build_object('name', NEW.first_name || ' ' || NEW.last_name);
      END IF;

    ELSE
      -- Unknown table, skip
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END CASE;

  -- Insert the log entry
  IF _company_id IS NOT NULL THEN
    INSERT INTO public.company_activity_log (company_id, user_id, action, target_type, target_id, details)
    VALUES (_company_id, _user_id, _action, _target_type, _target_id, _details);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 4. Create triggers
CREATE TRIGGER log_orders_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_company_activity();

CREATE TRIGGER log_order_status_history_activity
  AFTER INSERT ON public.order_status_history
  FOR EACH ROW EXECUTE FUNCTION public.log_company_activity();

CREATE TRIGGER log_suppliers_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.log_company_activity();

CREATE TRIGGER log_employees_activity
  AFTER INSERT OR UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.log_company_activity();

CREATE TRIGGER log_profiles_activity
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_company_activity();
