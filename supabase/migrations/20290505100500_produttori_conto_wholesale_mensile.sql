CREATE TABLE public.produttori_conti_wholesale (
  produttore_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  stripe_customer_id text NOT NULL,
  stripe_payment_method_id text NOT NULL,
  stripe_invoice_id text UNIQUE,
  stripe_status text,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  wholesale_pct numeric NOT NULL CHECK (wholesale_pct BETWEEN 0 AND 100),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (produttore_id, period)
);

ALTER TABLE public.produttori_conti_wholesale ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.produttori_conti_wholesale FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.produttori_conti_wholesale TO service_role;
