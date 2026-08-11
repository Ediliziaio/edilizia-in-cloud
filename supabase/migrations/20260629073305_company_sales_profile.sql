-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.company_sales_profile (
  company_id    uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  attivita      text,
  cliente_tipo  text DEFAULT 'privato',
  problema      text,
  usp           text,
  prove         text,
  offerta       text,
  obiezioni     text,
  voce          text,
  vietati       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.company_sales_profile IS
  'Profilo vendita per-azienda: input strategico riusato dall''AI per generare i testi dei template preventivo.';

ALTER TABLE public.company_sales_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_sales_profile_company ON public.company_sales_profile;
CREATE POLICY company_sales_profile_company ON public.company_sales_profile
  FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id())
  WITH CHECK (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS company_sales_profile_service ON public.company_sales_profile;
CREATE POLICY company_sales_profile_service ON public.company_sales_profile
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS company_sales_profile_super ON public.company_sales_profile;
CREATE POLICY company_sales_profile_super ON public.company_sales_profile
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));
