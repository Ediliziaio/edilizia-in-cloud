CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  matched_amount numeric NOT NULL DEFAULT 0,
  match_type text NOT NULL DEFAULT 'manual',
  match_score integer,
  matched_by uuid,
  matched_at timestamptz NOT NULL DEFAULT now(),
  unmatched_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
