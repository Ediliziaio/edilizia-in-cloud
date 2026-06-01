-- ============================================================================
-- #40 Governance — company_governance_settings
-- ============================================================================
-- Soglie di governance configurabili per azienda (1 riga per company,
-- PRIMARY KEY = company_id). Colonne flat, consumate dalla logica pura in
-- src/lib/governance/thresholds.ts (governanceFromRow / governanceToRow).
--
-- Coperti:
--   1. Doppia approvazione preventivi oltre un importo soglia (in €).
--   2. Alert di scostamento SAL (avanzamento dichiarato vs costi consumati, ±%).
--   3. Soglia di marginalità "sana" delle commesse (% di margine minimo).
--
-- Default allineati a DEFAULT_GOVERNANCE_THRESHOLDS:
--   preventivo  → { enabled: false, importoSoglia: 50000 }
--   sal         → { enabled: false, tolleranzaPerc: 5 }
--   marginalita → { enabled: true,  sogliaMinimaPerc: 15 }
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_governance_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,

  -- 1. Doppia approvazione preventivi
  preventivo_doppia_firma_enabled BOOLEAN NOT NULL DEFAULT false,
  preventivo_soglia_importo NUMERIC NOT NULL DEFAULT 50000
    CHECK (preventivo_soglia_importo >= 0 AND preventivo_soglia_importo <= 100000000),

  -- 2. Scostamento SAL (avanzamento vs costi)
  sal_scostamento_enabled BOOLEAN NOT NULL DEFAULT false,
  sal_tolleranza_perc NUMERIC NOT NULL DEFAULT 5
    CHECK (sal_tolleranza_perc >= 0 AND sal_tolleranza_perc <= 100),

  -- 3. Marginalità commesse
  marginalita_alert_enabled BOOLEAN NOT NULL DEFAULT true,
  marginalita_soglia_perc NUMERIC NOT NULL DEFAULT 15
    CHECK (marginalita_soglia_perc >= 0 AND marginalita_soglia_perc <= 100),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_company_governance_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_governance_settings_updated_at ON public.company_governance_settings;
CREATE TRIGGER company_governance_settings_updated_at
  BEFORE UPDATE ON public.company_governance_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_company_governance_settings_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE public.company_governance_settings ENABLE ROW LEVEL SECURITY;

-- Read: any member of the company OR super_admin
DROP POLICY IF EXISTS cgs_read ON public.company_governance_settings;
CREATE POLICY cgs_read ON public.company_governance_settings
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id IN (
      SELECT company_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  );

-- Write (INSERT/UPDATE/DELETE): company_admin OR super_admin
DROP POLICY IF EXISTS cgs_write ON public.company_governance_settings;
CREATE POLICY cgs_write ON public.company_governance_settings
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id IN (
      SELECT company_id FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'company_admin'::public.app_role
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id IN (
      SELECT company_id FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'company_admin'::public.app_role
    )
  );

-- ============================================================================
-- Seed: una riga (coi default) per ogni company esistente
-- ============================================================================
INSERT INTO public.company_governance_settings (company_id)
SELECT c.id FROM public.companies c
ON CONFLICT (company_id) DO NOTHING;

-- ============================================================================
-- Trigger: crea settings automaticamente per ogni nuova company
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_default_governance_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_governance_settings (company_id)
  VALUES (NEW.id)
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_create_governance_settings ON public.companies;
CREATE TRIGGER companies_create_governance_settings
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_governance_settings();

COMMENT ON TABLE public.company_governance_settings IS
  'Soglie di governance per azienda (doppia approvazione preventivi, scostamento SAL, marginalità minima). 1 riga per company. Logica in src/lib/governance/thresholds.ts.';
