-- order_installments: rate di pagamento dinamiche (N rate per ordine)
CREATE TABLE public.order_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'deposit',
  amount NUMERIC NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_date DATE,
  expected_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_installments_type_check CHECK (type IN ('deposit', 'balance', 'financing'))
);
