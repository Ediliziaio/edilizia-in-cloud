-- ═══════════════════════════════════════════════════════════════════════════
-- Sprint S6 — Impostazioni Sopralluoghi per company
-- ---------------------------------------------------------------------------
-- Permette a ogni azienda di:
--   1. Attivare/disattivare i template di sistema (default: tutti attivi se
--      mai modificato)
--   2. Clonare un template di sistema per personalizzarlo (already via
--      survey_templates.is_system=false + company_id)
--
-- Nuovo: tabella survey_template_settings con preferenze per (company, template)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.survey_template_settings (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.survey_templates(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (company_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_survey_template_settings_company
  ON public.survey_template_settings(company_id);

ALTER TABLE public.survey_template_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tpl_settings_select" ON public.survey_template_settings;
CREATE POLICY "tpl_settings_select" ON public.survey_template_settings
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "tpl_settings_modify" ON public.survey_template_settings;
CREATE POLICY "tpl_settings_modify" ON public.survey_template_settings
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "tpl_settings_service" ON public.survey_template_settings;
CREATE POLICY "tpl_settings_service" ON public.survey_template_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- RPC: list_survey_templates_with_settings(company_id)
-- Ritorna tutti i template visibili (system + company-owned) con flag
-- is_enabled per la company corrente.
-- Convenzione: se non c'è una row in survey_template_settings per
-- (company, template), il default è is_enabled=true (backward compat).
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_survey_templates_with_settings()
RETURNS TABLE (
  id UUID,
  company_id UUID,
  category TEXT,
  name TEXT,
  description TEXT,
  is_system BOOLEAN,
  is_active BOOLEAN,
  area_label TEXT,
  area_label_plural TEXT,
  element_label TEXT,
  schema JSONB,
  version INT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  -- Settings per la company corrente
  enabled_for_company BOOLEAN,
  sort_order_for_company INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := public.get_my_company_id();
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Profilo senza azienda' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    t.id, t.company_id, t.category, t.name, t.description,
    t.is_system, t.is_active, t.area_label, t.area_label_plural, t.element_label,
    t.schema, t.version, t.created_at, t.updated_at,
    COALESCE(s.is_enabled, true) AS enabled_for_company,
    COALESCE(s.sort_order, 0) AS sort_order_for_company
  FROM public.survey_templates t
  LEFT JOIN public.survey_template_settings s
    ON s.template_id = t.id AND s.company_id = v_company
  WHERE t.is_active = true
    AND (t.is_system = true OR t.company_id = v_company)
  ORDER BY
    COALESCE(s.sort_order, 0),
    t.is_system DESC,
    t.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_survey_templates_with_settings() TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- RPC: toggle_survey_template(template_id, enabled)
-- Upsert in survey_template_settings.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.toggle_survey_template(
  p_template_id UUID,
  p_enabled BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := public.get_my_company_id();
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Profilo senza azienda' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.survey_template_settings (company_id, template_id, is_enabled, updated_by)
  VALUES (v_company, p_template_id, p_enabled, auth.uid())
  ON CONFLICT (company_id, template_id)
  DO UPDATE SET
    is_enabled = EXCLUDED.is_enabled,
    updated_by = auth.uid(),
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_survey_template(UUID, BOOLEAN) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- RPC: clone_survey_template(source_template_id, new_name)
-- Clona un template (system o company) in un nuovo template di proprietà
-- della company corrente, così l'utente può modificarne schema/foto/campi.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.clone_survey_template(
  p_source_id UUID,
  p_new_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := public.get_my_company_id();
  v_source RECORD;
  v_new_id UUID;
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Profilo senza azienda' USING ERRCODE = '42501';
  END IF;
  IF p_new_name IS NULL OR length(trim(p_new_name)) < 3 THEN
    RAISE EXCEPTION 'Nome troppo corto (min 3 char)' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_source FROM public.survey_templates WHERE id = p_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template sorgente non trovato' USING ERRCODE = '42704';
  END IF;
  -- Verifica accesso al template sorgente (system o stessa company)
  IF NOT v_source.is_system AND v_source.company_id <> v_company THEN
    RAISE EXCEPTION 'Permesso negato sul template sorgente' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.survey_templates (
    company_id, category, name, description, is_system, is_active,
    area_label, area_label_plural, element_label, schema, version,
    created_by
  ) VALUES (
    v_company, v_source.category, trim(p_new_name), v_source.description,
    false, true,
    v_source.area_label, v_source.area_label_plural, v_source.element_label,
    v_source.schema, 1,
    auth.uid()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clone_survey_template(UUID, TEXT) TO authenticated;

COMMIT;
