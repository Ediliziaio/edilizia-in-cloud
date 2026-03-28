-- 4. bank_transactions
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  external_transaction_id text NOT NULL,
  booking_date date, value_date date,
  amount numeric(15,2) NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  description text, creditor_name text, debtor_name text,
  creditor_iban text, debtor_iban text, merchant_name text, reference text,
  transaction_type text NOT NULL DEFAULT 'debit',
  status text NOT NULL DEFAULT 'booked',
  category text, category_icon text, note text,
  linked_invoice_id uuid, linked_cost_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, external_transaction_id)
);
