CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stripe_invoice_id   TEXT NOT NULL UNIQUE,
  stripe_customer_id  TEXT,
  amount_paid         INTEGER NOT NULL DEFAULT 0,
  amount_due          INTEGER NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'eur',
  status              TEXT NOT NULL DEFAULT 'draft',
  invoice_url         TEXT,
  invoice_pdf         TEXT,
  period_start        TIMESTAMPTZ,
  period_end          TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
