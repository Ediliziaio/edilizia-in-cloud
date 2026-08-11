-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.meta_ab_tests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  base_campaign_id    uuid NOT NULL REFERENCES public.meta_campaigns(id) ON DELETE CASCADE,
  variant_campaign_id uuid REFERENCES public.meta_campaigns(id) ON DELETE SET NULL,
  variable            text NOT NULL,
  hypothesis          text,
  new_value           jsonb,
  status              text NOT NULL DEFAULT 'running' CHECK (status IN ('running','decided','stopped')),
  winner              text CHECK (winner IN ('base','variant')),
  started_at          timestamptz NOT NULL DEFAULT now(),
  decided_at          timestamptz,
  created_by          uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_meta_ab_tests_company ON public.meta_ab_tests (company_id, status);
CREATE INDEX IF NOT EXISTS idx_meta_ab_tests_base ON public.meta_ab_tests (base_campaign_id);

ALTER TABLE public.meta_ab_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_ab_tests_select ON public.meta_ab_tests;
CREATE POLICY meta_ab_tests_select ON public.meta_ab_tests FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS meta_ab_tests_admin ON public.meta_ab_tests;
CREATE POLICY meta_ab_tests_admin ON public.meta_ab_tests FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id((SELECT auth.uid()))
    AND (public.has_role((SELECT auth.uid()), 'company_admin'::app_role)
         OR public.has_role((SELECT auth.uid()), 'super_admin'::app_role))
  )
  WITH CHECK (
    company_id = public.get_user_company_id((SELECT auth.uid()))
    AND (public.has_role((SELECT auth.uid()), 'company_admin'::app_role)
         OR public.has_role((SELECT auth.uid()), 'super_admin'::app_role))
  );

DROP POLICY IF EXISTS meta_ab_tests_service ON public.meta_ab_tests;
CREATE POLICY meta_ab_tests_service ON public.meta_ab_tests FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.meta_ab_tests IS 'MP-ADS-04 GAP-2: A/B test campagne Meta (base vs variant). RLS come meta_campaigns.';
