
CREATE TABLE public.bank_reconciliations (
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

CREATE INDEX idx_bank_reconciliations_company ON public.bank_reconciliations(company_id);
CREATE INDEX idx_bank_reconciliations_transaction ON public.bank_reconciliations(transaction_id);
CREATE INDEX idx_bank_reconciliations_invoice ON public.bank_reconciliations(invoice_id);

ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for bank_reconciliations"
  ON public.bank_reconciliations
  FOR ALL
  TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
