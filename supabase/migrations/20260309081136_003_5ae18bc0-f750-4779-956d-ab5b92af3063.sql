-- 2. bank_connections
CREATE TABLE IF NOT EXISTS public.bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_slug text NOT NULL DEFAULT 'gocardless',
  institution_id text NOT NULL,
  institution_name text NOT NULL,
  institution_logo text,
  institution_country text DEFAULT 'IT',
  requisition_id text,
  requisition_link text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  last_sync_at timestamptz,
  accounts_count int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, requisition_id)
);
