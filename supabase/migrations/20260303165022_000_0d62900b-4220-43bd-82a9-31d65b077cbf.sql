-- meta_ad_accounts: stores ad accounts linked to an integration
CREATE TABLE public.meta_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  ad_account_id text NOT NULL,
  ad_account_name text NOT NULL DEFAULT '',
  account_status integer DEFAULT 0,
  currency text DEFAULT 'EUR',
  selected boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, ad_account_id)
);
