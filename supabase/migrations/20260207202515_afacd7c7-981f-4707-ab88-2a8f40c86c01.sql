-- Create employees table (Dipendenti Interni)
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  gross_salary numeric NOT NULL DEFAULT 0,
  net_salary numeric NOT NULL DEFAULT 0,
  monthly_hours integer NOT NULL DEFAULT 160,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create external_teams table (Squadre Esterne)
CREATE TABLE public.external_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create order_employees table (Assegnazione Dipendenti agli Ordini)
CREATE TABLE public.order_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  hours_worked numeric NOT NULL DEFAULT 0,
  hourly_rate numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create order_external_teams table (Squadre Esterne per Ordine)
CREATE TABLE public.order_external_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  external_team_id uuid NOT NULL REFERENCES public.external_teams(id) ON DELETE CASCADE,
  total_cost numeric NOT NULL DEFAULT 0,
  payment_date date,
  is_paid boolean NOT NULL DEFAULT false,
  paid_date date,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_external_teams ENABLE ROW LEVEL SECURITY;

-- RLS Policies for employees
CREATE POLICY "Company admins can manage their employees"
ON public.employees FOR ALL
USING (
  has_role(auth.uid(), 'company_admin'::app_role) AND 
  company_id = get_user_company_id(auth.uid())
);

CREATE POLICY "Super admins can manage all employees"
ON public.employees FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- RLS Policies for external_teams
CREATE POLICY "Company admins can manage their external teams"
ON public.external_teams FOR ALL
USING (
  has_role(auth.uid(), 'company_admin'::app_role) AND 
  company_id = get_user_company_id(auth.uid())
);

CREATE POLICY "Super admins can manage all external teams"
ON public.external_teams FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- RLS Policies for order_employees
CREATE POLICY "Company admins can manage their order employees"
ON public.order_employees FOR ALL
USING (
  has_role(auth.uid(), 'company_admin'::app_role) AND 
  EXISTS (
    SELECT 1 FROM orders o 
    WHERE o.id = order_employees.order_id 
    AND o.company_id = get_user_company_id(auth.uid())
  )
);

CREATE POLICY "Super admins can manage all order employees"
ON public.order_employees FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- RLS Policies for order_external_teams
CREATE POLICY "Company admins can manage their order external teams"
ON public.order_external_teams FOR ALL
USING (
  has_role(auth.uid(), 'company_admin'::app_role) AND 
  EXISTS (
    SELECT 1 FROM orders o 
    WHERE o.id = order_external_teams.order_id 
    AND o.company_id = get_user_company_id(auth.uid())
  )
);

CREATE POLICY "Super admins can manage all order external teams"
ON public.order_external_teams FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at on employees
CREATE TRIGGER update_employees_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();