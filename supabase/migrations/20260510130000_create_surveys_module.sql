-- ═══════════════════════════════════════════════════════════════════════════
-- SPRINT S1 — Modulo Sopralluoghi (rilievi tecnici sul cantiere)
-- ---------------------------------------------------------------------------
-- 6 tabelle:
--   survey_templates  — template di sistema + custom company
--   surveys           — header sopralluogo (FK orders soft)
--   survey_areas      — stanze/falde/facciate
--   survey_elements   — infissi/sanitari/pannelli/...
--   survey_media      — foto/audio/sketch/firma
--   survey_activity_log — audit
--   survey_assignees  — M2M sopralluogo↔utenti (subappaltatori, operai, ...)
-- + Storage bucket 'surveys' privato
-- + Feature flag 'surveys_module' Beta override per Demo Azienda S.r.l.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) survey_templates
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.survey_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'infissi', 'fotovoltaico', 'ristrutturazione', 'bagno', 'cucina',
    'cappotto', 'tetto', 'impianti', 'pavimentazioni', 'porte_interne',
    'climatizzazione', 'custom'
  )),
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  area_label TEXT NOT NULL DEFAULT 'Area',
  area_label_plural TEXT NOT NULL DEFAULT 'Aree',
  element_label TEXT NOT NULL DEFAULT 'Elemento',
  schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT survey_templates_system_or_company CHECK (
    (is_system = true AND company_id IS NULL) OR
    (is_system = false AND company_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_survey_templates_company ON public.survey_templates(company_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_survey_templates_category ON public.survey_templates(category) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_survey_templates_system ON public.survey_templates(is_system) WHERE is_system = true;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) surveys (header)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.survey_templates(id),
  client_id UUID,                                    -- soft FK (varia per company)
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,  -- Commessa associata
  technician_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  code TEXT,                                         -- SOP-YYYY-NNNN

  mode TEXT NOT NULL DEFAULT 'structured' CHECK (mode IN ('structured', 'express')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'in_progress', 'completed', 'reviewed', 'signed',
    'converted', 'archived', 'cancelled'
  )),

  header_data JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Indirizzo
  address TEXT,
  address_number TEXT,
  city TEXT,
  zip TEXT,
  province TEXT,
  country TEXT DEFAULT 'IT',
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),

  -- Note + media
  notes TEXT,
  general_audio_url TEXT,
  general_audio_transcription TEXT,

  -- Firma cliente
  client_signature_url TEXT,
  client_signature_name TEXT,
  client_signature_at TIMESTAMPTZ,

  -- Output collegamenti soft
  estimate_id UUID,
  supplier_order_id UUID,
  pdf_report_url TEXT,

  -- Tempistiche
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  duration_minutes INT,

  weather_conditions TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,

  CONSTRAINT surveys_code_unique UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_surveys_company_status ON public.surveys(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_surveys_order ON public.surveys(order_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_surveys_client ON public.surveys(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_surveys_technician ON public.surveys(technician_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_surveys_template ON public.surveys(template_id);
CREATE INDEX IF NOT EXISTS idx_surveys_scheduled ON public.surveys(company_id, scheduled_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_surveys_created ON public.surveys(company_id, created_at DESC) WHERE deleted_at IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) survey_areas
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.survey_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  area_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  audio_url TEXT,
  audio_transcription TEXT,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_survey_areas_survey ON public.survey_areas(survey_id, position);

-- ───────────────────────────────────────────────────────────────────────────
-- 4) survey_elements
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.survey_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  area_id UUID NOT NULL REFERENCES public.survey_areas(id) ON DELETE CASCADE,
  element_type TEXT NOT NULL,
  element_label TEXT,
  position INT NOT NULL DEFAULT 0,
  values JSONB NOT NULL DEFAULT '{}'::jsonb,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes TEXT,
  audio_url TEXT,
  audio_transcription TEXT,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  missing_required_fields TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_survey_elements_area ON public.survey_elements(area_id, position);
CREATE INDEX IF NOT EXISTS idx_survey_elements_survey ON public.survey_elements(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_elements_type ON public.survey_elements(element_type);

-- ───────────────────────────────────────────────────────────────────────────
-- 5) survey_media
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.survey_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  area_id UUID REFERENCES public.survey_areas(id) ON DELETE CASCADE,
  element_id UUID REFERENCES public.survey_elements(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('photo', 'annotated_photo', 'sketch', 'audio', 'signature', 'document')),
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  storage_path TEXT,
  checklist_key TEXT,
  checklist_label TEXT,
  annotations JSONB,
  duration_seconds INT,
  transcription TEXT,
  filename TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  taken_at TIMESTAMPTZ,
  taken_latitude NUMERIC(10, 7),
  taken_longitude NUMERIC(10, 7),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_survey_media_survey ON public.survey_media(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_media_area ON public.survey_media(area_id);
CREATE INDEX IF NOT EXISTS idx_survey_media_element ON public.survey_media(element_id);
CREATE INDEX IF NOT EXISTS idx_survey_media_checklist ON public.survey_media(element_id, checklist_key) WHERE checklist_key IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) survey_activity_log
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.survey_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_survey_activity_survey ON public.survey_activity_log(survey_id, created_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 7) survey_assignees (M2M sopralluogo↔utenti)
-- ---------------------------------------------------------------------------
-- Permette di assegnare 1+ tecnici/subappaltatori/operai a un sopralluogo.
-- Distinto da surveys.technician_id (legacy: il tecnico "principale").
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.survey_assignees (
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'technician' CHECK (role IN ('technician', 'subcontractor', 'employee', 'observer')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  PRIMARY KEY (survey_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_survey_assignees_user ON public.survey_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_survey_assignees_survey ON public.survey_assignees(survey_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER updated_at
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.surveys_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS surveys_updated_at ON public.surveys;
CREATE TRIGGER surveys_updated_at BEFORE UPDATE ON public.surveys
  FOR EACH ROW EXECUTE FUNCTION public.surveys_set_updated_at();

DROP TRIGGER IF EXISTS survey_templates_updated_at ON public.survey_templates;
CREATE TRIGGER survey_templates_updated_at BEFORE UPDATE ON public.survey_templates
  FOR EACH ROW EXECUTE FUNCTION public.surveys_set_updated_at();

DROP TRIGGER IF EXISTS survey_areas_updated_at ON public.survey_areas;
CREATE TRIGGER survey_areas_updated_at BEFORE UPDATE ON public.survey_areas
  FOR EACH ROW EXECUTE FUNCTION public.surveys_set_updated_at();

DROP TRIGGER IF EXISTS survey_elements_updated_at ON public.survey_elements;
CREATE TRIGGER survey_elements_updated_at BEFORE UPDATE ON public.survey_elements
  FOR EACH ROW EXECUTE FUNCTION public.surveys_set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER: numerazione SOP-YYYY-NNNN
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.generate_survey_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_year TEXT := to_char(now(), 'YYYY');
  v_next INT;
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    SELECT COALESCE(MAX(
      CAST(regexp_replace(code, '^SOP-\d{4}-', '') AS INT)
    ), 0) + 1
    INTO v_next
    FROM public.surveys
    WHERE company_id = NEW.company_id
      AND code LIKE 'SOP-' || v_year || '-%';
    NEW.code := 'SOP-' || v_year || '-' || lpad(v_next::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS surveys_generate_code ON public.surveys;
CREATE TRIGGER surveys_generate_code BEFORE INSERT ON public.surveys
  FOR EACH ROW EXECUTE FUNCTION public.generate_survey_code();

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.survey_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_assignees ENABLE ROW LEVEL SECURITY;

-- ───────────────────────────────────────────────────────────────────────────
-- survey_templates: tutti vedono system, ognuno modifica solo i propri
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "templates_select" ON public.survey_templates;
CREATE POLICY "templates_select" ON public.survey_templates
  FOR SELECT TO authenticated
  USING (
    is_system = true
    OR company_id = public.get_my_company_id()
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "templates_insert_company" ON public.survey_templates;
CREATE POLICY "templates_insert_company" ON public.survey_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    is_system = false
    AND company_id = public.get_my_company_id()
  );

DROP POLICY IF EXISTS "templates_update_company" ON public.survey_templates;
CREATE POLICY "templates_update_company" ON public.survey_templates
  FOR UPDATE TO authenticated
  USING (is_system = false AND company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "templates_delete_company" ON public.survey_templates;
CREATE POLICY "templates_delete_company" ON public.survey_templates
  FOR DELETE TO authenticated
  USING (is_system = false AND company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "templates_service" ON public.survey_templates;
CREATE POLICY "templates_service" ON public.survey_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- surveys: scope per company + assignees vedono solo i propri sopralluoghi
-- (subappaltatori/employee con role limitato vedono solo assigned_to_me)
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "surveys_select" ON public.surveys;
CREATE POLICY "surveys_select" ON public.surveys
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    OR EXISTS (
      SELECT 1 FROM public.survey_assignees a
      WHERE a.survey_id = surveys.id AND a.user_id = auth.uid()
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "surveys_insert" ON public.surveys;
CREATE POLICY "surveys_insert" ON public.surveys
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "surveys_update" ON public.surveys;
CREATE POLICY "surveys_update" ON public.surveys
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    OR EXISTS (
      SELECT 1 FROM public.survey_assignees a
      WHERE a.survey_id = surveys.id AND a.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "surveys_delete" ON public.surveys;
CREATE POLICY "surveys_delete" ON public.surveys
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() AND public.has_role(auth.uid(), 'company_admin'::public.app_role));

DROP POLICY IF EXISTS "surveys_service" ON public.surveys;
CREATE POLICY "surveys_service" ON public.surveys
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- survey_areas / elements / media / activity: ereditano dal survey
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "areas_via_survey" ON public.survey_areas;
CREATE POLICY "areas_via_survey" ON public.survey_areas
  FOR ALL TO authenticated
  USING (
    survey_id IN (SELECT id FROM public.surveys WHERE company_id = public.get_my_company_id())
    OR survey_id IN (SELECT survey_id FROM public.survey_assignees WHERE user_id = auth.uid())
  )
  WITH CHECK (
    survey_id IN (SELECT id FROM public.surveys WHERE company_id = public.get_my_company_id())
    OR survey_id IN (SELECT survey_id FROM public.survey_assignees WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "areas_service" ON public.survey_areas;
CREATE POLICY "areas_service" ON public.survey_areas FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "elements_via_survey" ON public.survey_elements;
CREATE POLICY "elements_via_survey" ON public.survey_elements
  FOR ALL TO authenticated
  USING (
    survey_id IN (SELECT id FROM public.surveys WHERE company_id = public.get_my_company_id())
    OR survey_id IN (SELECT survey_id FROM public.survey_assignees WHERE user_id = auth.uid())
  )
  WITH CHECK (
    survey_id IN (SELECT id FROM public.surveys WHERE company_id = public.get_my_company_id())
    OR survey_id IN (SELECT survey_id FROM public.survey_assignees WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "elements_service" ON public.survey_elements;
CREATE POLICY "elements_service" ON public.survey_elements FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "media_via_survey" ON public.survey_media;
CREATE POLICY "media_via_survey" ON public.survey_media
  FOR ALL TO authenticated
  USING (
    survey_id IN (SELECT id FROM public.surveys WHERE company_id = public.get_my_company_id())
    OR survey_id IN (SELECT survey_id FROM public.survey_assignees WHERE user_id = auth.uid())
  )
  WITH CHECK (
    survey_id IN (SELECT id FROM public.surveys WHERE company_id = public.get_my_company_id())
    OR survey_id IN (SELECT survey_id FROM public.survey_assignees WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "media_service" ON public.survey_media;
CREATE POLICY "media_service" ON public.survey_media FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "activity_select_via_survey" ON public.survey_activity_log;
CREATE POLICY "activity_select_via_survey" ON public.survey_activity_log
  FOR SELECT TO authenticated
  USING (
    survey_id IN (SELECT id FROM public.surveys WHERE company_id = public.get_my_company_id())
    OR survey_id IN (SELECT survey_id FROM public.survey_assignees WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "activity_insert_via_survey" ON public.survey_activity_log;
CREATE POLICY "activity_insert_via_survey" ON public.survey_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    survey_id IN (SELECT id FROM public.surveys WHERE company_id = public.get_my_company_id())
    OR survey_id IN (SELECT survey_id FROM public.survey_assignees WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "activity_service" ON public.survey_activity_log;
CREATE POLICY "activity_service" ON public.survey_activity_log FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "assignees_select" ON public.survey_assignees;
CREATE POLICY "assignees_select" ON public.survey_assignees
  FOR SELECT TO authenticated
  USING (
    survey_id IN (SELECT id FROM public.surveys WHERE company_id = public.get_my_company_id())
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "assignees_modify" ON public.survey_assignees;
CREATE POLICY "assignees_modify" ON public.survey_assignees
  FOR ALL TO authenticated
  USING (survey_id IN (SELECT id FROM public.surveys WHERE company_id = public.get_my_company_id()))
  WITH CHECK (survey_id IN (SELECT id FROM public.surveys WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "assignees_service" ON public.survey_assignees;
CREATE POLICY "assignees_service" ON public.survey_assignees FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC: surveys_assigned_to_me — dashboard personale
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.surveys_assigned_to_me()
RETURNS TABLE (
  id UUID,
  code TEXT,
  status TEXT,
  template_name TEXT,
  template_category TEXT,
  scheduled_at TIMESTAMPTZ,
  address TEXT,
  city TEXT,
  client_id UUID,
  order_id UUID,
  notes TEXT,
  is_complete BOOLEAN,
  my_role TEXT,
  assigned_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.id, s.code, s.status, t.name AS template_name, t.category AS template_category,
    s.scheduled_at, s.address, s.city, s.client_id, s.order_id, s.notes,
    (s.status IN ('completed', 'reviewed', 'signed', 'converted')) AS is_complete,
    a.role AS my_role,
    a.assigned_at
  FROM public.surveys s
  JOIN public.survey_assignees a ON a.survey_id = s.id
  JOIN public.survey_templates t ON t.id = s.template_id
  WHERE a.user_id = auth.uid()
    AND s.deleted_at IS NULL
  -- Aggiunta: anche i sopralluoghi dove sono technician_id principale
  UNION
  SELECT
    s.id, s.code, s.status, t.name, t.category,
    s.scheduled_at, s.address, s.city, s.client_id, s.order_id, s.notes,
    (s.status IN ('completed', 'reviewed', 'signed', 'converted')),
    'technician'::TEXT,
    s.created_at
  FROM public.surveys s
  JOIN public.survey_templates t ON t.id = s.template_id
  WHERE s.technician_id = auth.uid()
    AND s.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.survey_assignees aa
      WHERE aa.survey_id = s.id AND aa.user_id = auth.uid()
    )
  ORDER BY scheduled_at DESC NULLS LAST, assigned_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.surveys_assigned_to_me() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- FEATURE FLAG: surveys_module (Beta)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.feature_flags (key, label, description, scope, is_active, default_value)
VALUES (
  'surveys_module',
  'Sopralluoghi (Beta)',
  'Modulo rilievi tecnici sul cantiere: template multi-verticale (infissi, bagno, fotovoltaico, ristrutturazione), foto checklist, audio, firma cliente, generazione PDF e preventivo automatico.',
  'company',
  true,
  false
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_active = true;

INSERT INTO public.platform_feature_flags (key, name, description, category, is_beta, default_value, sort_order, icon)
VALUES (
  'surveys_module',
  'Sopralluoghi (Beta)',
  'Modulo rilievi tecnici sul cantiere: template multi-verticale (infissi, bagno, fotovoltaico, ristrutturazione), foto checklist, audio, firma cliente, generazione PDF e preventivo automatico.',
  'operativa',
  true,
  false,
  110,
  'ClipboardList'
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_beta = true;

-- Override Demo Azienda
INSERT INTO public.company_feature_overrides (
  company_id, feature_key, is_enabled, override_reason, override_by
)
SELECT id, 'surveys_module', true, 'Beta — pilot Sopralluoghi modulo strategico', NULL
FROM public.companies WHERE name = 'Demo Azienda S.r.l.'
ON CONFLICT (company_id, feature_key) DO UPDATE SET
  is_enabled = true,
  override_reason = EXCLUDED.override_reason;

-- ═══════════════════════════════════════════════════════════════════════════
-- STORAGE bucket 'surveys'
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'surveys',
  'surveys',
  false,
  26214400,  -- 25 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/m4a', 'audio/ogg', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "surveys_storage_read" ON storage.objects;
CREATE POLICY "surveys_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'surveys'
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "surveys_storage_write" ON storage.objects;
CREATE POLICY "surveys_storage_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'surveys'
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "surveys_storage_delete" ON storage.objects;
CREATE POLICY "surveys_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'surveys'
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

COMMIT;
