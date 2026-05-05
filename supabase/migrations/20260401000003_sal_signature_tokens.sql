-- SAL digital signature tokens for committente sign-off.
-- This migration is dated before 20260403000000_sal_records.sql but already
-- references sal_records. Keep the prerequisite table here as the same schema
-- so a clean local/CI migration chain can start from zero.
CREATE TABLE IF NOT EXISTS public.sal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  numero_sal INTEGER NOT NULL DEFAULT 1,
  data_emissione DATE NOT NULL DEFAULT CURRENT_DATE,
  stato TEXT NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza', 'emesso', 'approvato')),
  importo_totale NUMERIC(12, 2) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.sal_signature_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sal_id UUID NOT NULL REFERENCES public.sal_records(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL,
  signed_at TIMESTAMPTZ,
  signed_by_name TEXT,
  signed_by_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(token)
);

ALTER TABLE public.sal_signature_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sal_signature_tokens_tenant" ON public.sal_signature_tokens
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- Anon can read by token (for the firma-sal page)
CREATE POLICY "sal_signature_tokens_anon_read" ON public.sal_signature_tokens
  FOR SELECT TO anon
  USING (token IS NOT NULL AND expires_at > now() AND signed_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_sal_signature_tokens_token
  ON public.sal_signature_tokens(token);
