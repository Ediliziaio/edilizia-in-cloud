
-- Create appointments table
CREATE TABLE public.appointments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NULL,
  appointment_date date NOT NULL,
  appointment_time time NULL,
  assigned_to uuid NULL,
  appointment_type text NOT NULL DEFAULT 'generico',
  is_completed boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Company admin: ALL on own company
CREATE POLICY "Company admins can manage their appointments"
ON public.appointments FOR ALL
USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

-- Staff with can_view_calendar: SELECT
CREATE POLICY "Staff can view appointments if permitted"
ON public.appointments FOR SELECT
USING (has_permission(auth.uid(), 'can_view_calendar'::text) AND company_id = get_user_company_id(auth.uid()));

-- Staff with can_edit_orders: ALL
CREATE POLICY "Staff can manage appointments if permitted"
ON public.appointments FOR ALL
USING (has_permission(auth.uid(), 'can_edit_orders'::text) AND company_id = get_user_company_id(auth.uid()));

-- Super admin: ALL
CREATE POLICY "Super admins can manage all appointments"
ON public.appointments FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for common queries
CREATE INDEX idx_appointments_company_id ON public.appointments(company_id);
CREATE INDEX idx_appointments_order_id ON public.appointments(order_id);
CREATE INDEX idx_appointments_date ON public.appointments(appointment_date);
