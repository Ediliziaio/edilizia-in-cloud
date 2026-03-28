-- 3. bank_accounts
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  external_account_id text NOT NULL,
  iban text, bban text,
  account_name text, account_owner_name text,
  account_type text DEFAULT 'checking',
  currency text NOT NULL DEFAULT 'EUR',
  current_balance numeric(15,2), available_balance numeric(15,2),
  balance_updated_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, external_account_id)
);
