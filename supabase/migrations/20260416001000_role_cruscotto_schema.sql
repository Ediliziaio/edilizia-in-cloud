-- ════════════════════════════════════════════════════════════════
-- Role-based Cruscotto — Sprint 5.2
-- Tabelle per mappare role → dashboard (per ogni company)
-- e per template library globale.
-- ════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. company_role_dashboards — mapping (company, role) → dashboard
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_role_dashboards (
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role         public.app_role NOT NULL,
  dashboard_id uuid NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  updated_by   uuid REFERENCES auth.users(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, role)
);

CREATE INDEX IF NOT EXISTS idx_crd_dashboard ON public.company_role_dashboards(dashboard_id);

COMMENT ON TABLE public.company_role_dashboards IS
  'Per ogni azienda mappa un ruolo alla dashboard da mostrare su /azienda/cruscotto. Solo company_admin/super_admin può modificare.';

ALTER TABLE public.company_role_dashboards ENABLE ROW LEVEL SECURITY;

-- SELECT: tutti i membri della company possono leggere la propria mappa
DROP POLICY IF EXISTS "crd_read_company_members" ON public.company_role_dashboards;
CREATE POLICY "crd_read_company_members"
  ON public.company_role_dashboards FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- INSERT/UPDATE/DELETE: solo company_admin o super_admin sulla propria company
DROP POLICY IF EXISTS "crd_write_admin" ON public.company_role_dashboards;
CREATE POLICY "crd_write_admin"
  ON public.company_role_dashboards FOR ALL
  TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('company_admin','super_admin')
    )
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('company_admin','super_admin')
    )
  );

-- ──────────────────────────────────────────────────────────────────
-- 2. dashboard_templates — libreria pubblica di template
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dashboard_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,
  name          text NOT NULL,
  description   text,
  target_roles  public.app_role[] NOT NULL DEFAULT ARRAY[]::public.app_role[],
  category      text NOT NULL DEFAULT 'general',
  layout        jsonb NOT NULL,
  icon          text,
  sort_order    int NOT NULL DEFAULT 0,
  is_official   boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_templates_sort ON public.dashboard_templates(sort_order, name);
CREATE INDEX IF NOT EXISTS idx_dashboard_templates_roles ON public.dashboard_templates USING GIN(target_roles);

COMMENT ON TABLE public.dashboard_templates IS
  'Template di dashboard clonabili. Gestito via migration/service_role. Lettura pubblica agli autenticati.';

ALTER TABLE public.dashboard_templates ENABLE ROW LEVEL SECURITY;

-- SELECT: tutti gli autenticati
DROP POLICY IF EXISTS "templates_read_authenticated" ON public.dashboard_templates;
CREATE POLICY "templates_read_authenticated"
  ON public.dashboard_templates FOR SELECT
  TO authenticated
  USING (true);

-- Scrittura: nessuna policy = solo service_role via migration

-- ──────────────────────────────────────────────────────────────────
-- Grants
-- ──────────────────────────────────────────────────────────────────
GRANT SELECT ON public.company_role_dashboards TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.company_role_dashboards TO authenticated;
GRANT SELECT ON public.dashboard_templates TO authenticated;
