-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.crm_roi_simulations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id      uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  opportunity_id  uuid REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL,
  client_name     text NOT NULL DEFAULT '',
  inputs          jsonb NOT NULL DEFAULT '{}'::jsonb,
  results         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_roi_sim_company ON public.crm_roi_simulations (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_roi_sim_opportunity ON public.crm_roi_simulations (opportunity_id, created_at DESC) WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_roi_sim_contact ON public.crm_roi_simulations (contact_id, created_at DESC) WHERE contact_id IS NOT NULL;

ALTER TABLE public.crm_roi_simulations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can manage all roi simulations" ON public.crm_roi_simulations;
CREATE POLICY "Super admins can manage all roi simulations" ON public.crm_roi_simulations FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Company admins can manage their roi simulations" ON public.crm_roi_simulations;
CREATE POLICY "Company admins can manage their roi simulations" ON public.crm_roi_simulations FOR ALL USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid())) WITH CHECK (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Staff can view roi simulations if permitted" ON public.crm_roi_simulations;
CREATE POLICY "Staff can view roi simulations if permitted" ON public.crm_roi_simulations FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'can_view_orders') AND company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Staff can create roi simulations if permitted" ON public.crm_roi_simulations;
CREATE POLICY "Staff can create roi simulations if permitted" ON public.crm_roi_simulations FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'can_view_orders') AND company_id = get_user_company_id(auth.uid()));

COMMENT ON TABLE public.crm_roi_simulations IS 'Storico delle simulazioni ROI di vendita generate nel CRM (Simulatore ROI). inputs/results in jsonb, opzionalmente legate a contact/opportunity. RLS company-scoped come marketing_opportunities.';
