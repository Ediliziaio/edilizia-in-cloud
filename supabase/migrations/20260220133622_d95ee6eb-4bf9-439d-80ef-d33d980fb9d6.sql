CREATE TABLE public.order_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  error_type TEXT NOT NULL DEFAULT 'merce',
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  error_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
