
-- Create tasks table
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'da_fare',
  priority text NOT NULL DEFAULT 'normale',
  due_date date,
  assigned_to uuid REFERENCES public.profiles(id),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  stock_item_id uuid REFERENCES public.warehouse_stock(id) ON DELETE SET NULL,
  cost_id uuid REFERENCES public.company_costs(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'generale',
  created_by uuid NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Company admins can manage their tasks"
ON public.tasks FOR ALL
USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view tasks if permitted"
ON public.tasks FOR SELECT
USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can manage tasks if permitted"
ON public.tasks FOR ALL
USING (has_permission(auth.uid(), 'can_edit_orders'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Employees can view assigned tasks"
ON public.tasks FOR SELECT
USING (assigned_to = auth.uid());

CREATE POLICY "Super admins can manage all tasks"
ON public.tasks FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX idx_tasks_company_id ON public.tasks(company_id);
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);
