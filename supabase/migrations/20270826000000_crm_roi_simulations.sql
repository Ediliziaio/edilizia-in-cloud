-- ============================================================================
-- CRM — Simulatore ROI di vendita (storico simulazioni)
-- ============================================================================
-- Tabella che conserva le simulazioni ROI generate dal venditore DURANTE la
-- trattativa (strumento "quanto ti costa NON cambiare" → "EdiliziaInCloud non
-- costa, fa guadagnare"). Ogni riga = uno scenario salvato, opzionalmente
-- legato a un contatto e/o a un'opportunità del CRM marketing.
--
-- - `inputs`  jsonb: i parametri grezzi dello scenario (software/mese, ore perse
--   per voce, costo orario, errori/anno, abbonamento, assunzioni regolabili).
-- - `results` jsonb: l'output calcolato (costo attuale, costo con EiC, risparmio,
--   payback) — già strutturato per la generazione PDF/email del round 2.
--
-- RLS coerente con marketing_opportunities (super_admin globale + company_admin
-- company-scoped). Additiva e idempotente.
--
-- NOTA: applicare via MCP apply_migration (vedi project_migration_workflow).
-- ============================================================================

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

-- Indici per il recupero "ultima simulazione sul deal/contatto" e lo storico.
CREATE INDEX IF NOT EXISTS idx_crm_roi_sim_company
  ON public.crm_roi_simulations (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_roi_sim_opportunity
  ON public.crm_roi_simulations (opportunity_id, created_at DESC)
  WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_roi_sim_contact
  ON public.crm_roi_simulations (contact_id, created_at DESC)
  WHERE contact_id IS NOT NULL;

-- RLS — stesso modello di marketing_opportunities -----------------------------
ALTER TABLE public.crm_roi_simulations ENABLE ROW LEVEL SECURITY;

-- Super admin: accesso totale (console piattaforma).
DROP POLICY IF EXISTS "Super admins can manage all roi simulations" ON public.crm_roi_simulations;
CREATE POLICY "Super admins can manage all roi simulations"
  ON public.crm_roi_simulations FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Company admin: gestisce solo le simulazioni della propria azienda.
DROP POLICY IF EXISTS "Company admins can manage their roi simulations" ON public.crm_roi_simulations;
CREATE POLICY "Company admins can manage their roi simulations"
  ON public.crm_roi_simulations FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin'::app_role)
    AND company_id = get_user_company_id(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'company_admin'::app_role)
    AND company_id = get_user_company_id(auth.uid())
  );

-- Staff/venditori abilitati al CRM opportunità: leggono e creano simulazioni
-- nella propria azienda (lo strumento è usato dal venditore in trattativa).
DROP POLICY IF EXISTS "Staff can view roi simulations if permitted" ON public.crm_roi_simulations;
CREATE POLICY "Staff can view roi simulations if permitted"
  ON public.crm_roi_simulations FOR SELECT TO authenticated
  USING (
    has_permission(auth.uid(), 'can_view_orders')
    AND company_id = get_user_company_id(auth.uid())
  );

DROP POLICY IF EXISTS "Staff can create roi simulations if permitted" ON public.crm_roi_simulations;
CREATE POLICY "Staff can create roi simulations if permitted"
  ON public.crm_roi_simulations FOR INSERT TO authenticated
  WITH CHECK (
    has_permission(auth.uid(), 'can_view_orders')
    AND company_id = get_user_company_id(auth.uid())
  );

COMMENT ON TABLE public.crm_roi_simulations IS
  'Storico delle simulazioni ROI di vendita generate nel CRM (Simulatore ROI). inputs/results in jsonb, opzionalmente legate a contact/opportunity. RLS company-scoped come marketing_opportunities.';
