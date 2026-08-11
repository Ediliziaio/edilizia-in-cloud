-- Obiettivi commerciali PER AGENTE per mese — usato dalla Dashboard
-- commerciale per "vinto vs target" del singolo venditore (prima c'era solo
-- l'obiettivo aziendale companies.monthly_revenue_target).
--
-- period_month = primo giorno del mese di riferimento.

CREATE TABLE IF NOT EXISTS public.marketing_agent_targets (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  period_month date NOT NULL,
  target_revenue numeric NOT NULL DEFAULT 0,
  target_deals int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (company_id, agent_id, period_month)
);

ALTER TABLE public.marketing_agent_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mat super admin all" ON public.marketing_agent_targets;
CREATE POLICY "mat super admin all" ON public.marketing_agent_targets
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "mat company members" ON public.marketing_agent_targets;
CREATE POLICY "mat company members" ON public.marketing_agent_targets
  FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));
