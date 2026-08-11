-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS parent_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_companies_parent_company_id
  ON public.companies(parent_company_id) WHERE parent_company_id IS NOT NULL;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_comped boolean NOT NULL DEFAULT false;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS reseller_billing_mode text
    CHECK (reseller_billing_mode IS NULL OR reseller_billing_mode IN ('fabbrica_paga','reseller_paga'));

COMMENT ON COLUMN public.companies.parent_company_id IS
  'Produttore/fabbrica padre di questo rivenditore (white-label). NULL = company normale.';
COMMENT ON COLUMN public.companies.billing_comped IS
  'true = rivenditore pagato dal produttore (fabbrica-paga); false = paga noi.';
COMMENT ON COLUMN public.companies.reseller_billing_mode IS
  'Sul produttore: modello billing per i rivenditori (fabbrica_paga|reseller_paga).';

DROP POLICY IF EXISTS companies_produttore_vede_rivenditori ON public.companies;
CREATE POLICY companies_produttore_vede_rivenditori ON public.companies
  FOR SELECT TO authenticated
  USING (
    parent_company_id IS NOT NULL
    AND parent_company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.is_mio_rivenditore(p_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = p_company_id
      AND c.parent_company_id = public.get_user_company_id(auth.uid())
      AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_mio_rivenditore(uuid) TO authenticated;
