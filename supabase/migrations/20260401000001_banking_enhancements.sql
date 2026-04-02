-- Banking enhancements: counterparty fields + reconciliation status

-- 1. Add counterparty computed fields to bank_transactions
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS counterparty_name TEXT GENERATED ALWAYS AS (
    COALESCE(creditor_name, debtor_name)
  ) STORED,
  ADD COLUMN IF NOT EXISTS counterparty_iban TEXT GENERATED ALWAYS AS (
    COALESCE(creditor_iban, debtor_iban)
  ) STORED;

-- 2. Add reconciliation fields to bank_transactions
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS reconciliation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (reconciliation_status IN ('pending', 'reconciled', 'suggestion', 'ignored')),
  ADD COLUMN IF NOT EXISTS reconciled_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reconciliation_suggestions UUID[],
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;

-- 3. Indexes for reconciliation queries
CREATE INDEX IF NOT EXISTS idx_bank_transactions_reconciliation
  ON public.bank_transactions(company_id, reconciliation_status)
  WHERE reconciliation_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_bank_transactions_counterparty
  ON public.bank_transactions(company_id, counterparty_name);
