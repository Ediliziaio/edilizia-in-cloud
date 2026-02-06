-- Create table for order-level attachments with visibility control
CREATE TABLE public.order_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by UUID NOT NULL,
  visible_to_customer BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.order_attachments ENABLE ROW LEVEL SECURITY;

-- Company admins can manage their order attachments
CREATE POLICY "Company admins can manage their order attachments"
  ON public.order_attachments FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin') AND
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_attachments.order_id
      AND o.company_id = get_user_company_id(auth.uid())
    )
  );

-- Customers can view ONLY visible order attachments
CREATE POLICY "Customers can view visible order attachments"
  ON public.order_attachments FOR SELECT
  USING (
    visible_to_customer = true AND
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_attachments.order_id
      AND o.customer_id = auth.uid()
    )
  );

-- Super admins can manage all order attachments
CREATE POLICY "Super admins can manage all order attachments"
  ON public.order_attachments FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));