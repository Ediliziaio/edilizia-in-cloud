-- ════════════════════════════════════════════════════════════════
-- Sprint 1.15 — RPC save_dashboard con versioning automatico
-- ════════════════════════════════════════════════════════════════
-- Contratto:
--   save_dashboard(
--     p_dashboard_id  UUID   -- NULL = create, valorizzato = update (nuova versione)
--     p_name          TEXT   -- obbligatorio su create
--     p_description   TEXT,
--     p_scope         TEXT   -- 'personal' | 'company' | 'role:<role>'
--     p_icon          TEXT,
--     p_layout        JSONB  -- { widgets: [...], globalFilters: {...} }
--     p_note          TEXT   -- commento versione
--   ) RETURNS JSONB { dashboard_id, version, is_current: true }
--
-- Comportamento:
--   • Se p_dashboard_id IS NULL → crea dashboard + versione 1 (is_current=true)
--   • Altrimenti → append nuova versione (v+1), sposta is_current alla nuova
--   • Permessi: membro della company + (owner || company_admin)
--   • Validazione layout: struttura base, widget.type whitelist, metric_id esiste
--   • Auto-fill company_id e owner_id da auth context
-- ════════════════════════════════════════════════════════════════

-- Helper: validazione layout JSONB
CREATE OR REPLACE FUNCTION public._dashboard_validate_layout(p_layout JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_widget      JSONB;
  v_widget_type TEXT;
  v_metric_id   TEXT;
  v_allowed_types TEXT[] := ARRAY[
    'kpi_card', 'chart_line', 'chart_bar', 'chart_pie', 'chart_area',
    'table', 'progress', 'gauge', 'text_markdown', 'divider'
  ];
BEGIN
  -- Shape minima: oggetto con chiave 'widgets' array
  IF p_layout IS NULL OR jsonb_typeof(p_layout) <> 'object' THEN
    RAISE EXCEPTION 'Layout must be a JSON object' USING ERRCODE = '22023';
  END IF;

  IF NOT (p_layout ? 'widgets') OR jsonb_typeof(p_layout->'widgets') <> 'array' THEN
    RAISE EXCEPTION 'Layout.widgets must be an array' USING ERRCODE = '22023';
  END IF;

  -- Limiti di sanità
  IF jsonb_array_length(p_layout->'widgets') > 50 THEN
    RAISE EXCEPTION 'Too many widgets (max 50)' USING ERRCODE = '22023';
  END IF;

  -- Per ogni widget: type whitelist + metric_id esiste nel catalogo (se presente)
  FOR v_widget IN SELECT * FROM jsonb_array_elements(p_layout->'widgets')
  LOOP
    -- id obbligatorio
    IF NOT (v_widget ? 'id') OR jsonb_typeof(v_widget->'id') <> 'string' THEN
      RAISE EXCEPTION 'Widget missing id (string)' USING ERRCODE = '22023';
    END IF;

    -- type obbligatorio e whitelistato
    v_widget_type := v_widget->>'type';
    IF v_widget_type IS NULL OR NOT (v_widget_type = ANY(v_allowed_types)) THEN
      RAISE EXCEPTION 'Widget type % not allowed', COALESCE(v_widget_type, 'NULL') USING ERRCODE = '22023';
    END IF;

    -- Coordinate numeriche
    IF (v_widget ? 'x' AND jsonb_typeof(v_widget->'x') <> 'number')
       OR (v_widget ? 'y' AND jsonb_typeof(v_widget->'y') <> 'number')
       OR (v_widget ? 'w' AND jsonb_typeof(v_widget->'w') <> 'number')
       OR (v_widget ? 'h' AND jsonb_typeof(v_widget->'h') <> 'number') THEN
      RAISE EXCEPTION 'Widget % coordinates must be numbers', v_widget->>'id' USING ERRCODE = '22023';
    END IF;

    -- metric_id (se widget data-bound) deve esistere e essere attivo
    v_metric_id := v_widget->'config'->>'metric';
    IF v_metric_id IS NOT NULL AND v_widget_type NOT IN ('text_markdown', 'divider') THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.metric_catalog
        WHERE id = v_metric_id AND is_active = true
      ) THEN
        RAISE EXCEPTION 'Widget % references unknown or inactive metric %', v_widget->>'id', v_metric_id USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  -- globalFilters (se presente) deve essere oggetto
  IF (p_layout ? 'globalFilters') AND jsonb_typeof(p_layout->'globalFilters') <> 'object' THEN
    RAISE EXCEPTION 'Layout.globalFilters must be an object' USING ERRCODE = '22023';
  END IF;
END $$;

COMMENT ON FUNCTION public._dashboard_validate_layout(JSONB) IS
  'Valida struttura layout dashboard: widgets whitelistati, metric_id esistenti nel catalogo.';

-- ════════════════════════════════════════════════════════════════
-- RPC save_dashboard
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.save_dashboard(
  p_dashboard_id UUID,
  p_name         TEXT,
  p_description  TEXT,
  p_scope        TEXT,
  p_icon         TEXT,
  p_layout       JSONB,
  p_note         TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID := auth.uid();
  v_company_id  UUID;
  v_dashboard   public.dashboards%ROWTYPE;
  v_next_ver    INT;
  v_new_ver_id  UUID;
BEGIN
  -- Auth
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context for user' USING ERRCODE = '42501';
  END IF;

  -- Validazione scope
  IF p_scope IS NULL OR NOT (
       p_scope = 'personal'
    OR p_scope = 'company'
    OR p_scope LIKE 'role:%'
  ) THEN
    RAISE EXCEPTION 'Invalid scope %', COALESCE(p_scope, 'NULL') USING ERRCODE = '22023';
  END IF;

  -- Validazione layout (throws se invalido)
  PERFORM public._dashboard_validate_layout(p_layout);

  -- ═══ CREATE ═══
  IF p_dashboard_id IS NULL THEN
    IF p_name IS NULL OR btrim(p_name) = '' THEN
      RAISE EXCEPTION 'Dashboard name is required on create' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.dashboards (company_id, owner_id, name, description, scope, icon)
    VALUES (v_company_id, v_user_id, p_name, p_description, p_scope, p_icon)
    RETURNING * INTO v_dashboard;

    INSERT INTO public.dashboard_versions (
      dashboard_id, version, layout, is_current, created_by, note
    ) VALUES (
      v_dashboard.id, 1, p_layout, true, v_user_id, p_note
    ) RETURNING id INTO v_new_ver_id;

    RETURN jsonb_build_object(
      'dashboard_id', v_dashboard.id,
      'version_id',   v_new_ver_id,
      'version',      1,
      'is_current',   true,
      'created',      true
    );
  END IF;

  -- ═══ UPDATE (append nuova versione) ═══
  SELECT * INTO v_dashboard FROM public.dashboards WHERE id = p_dashboard_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dashboard % not found', p_dashboard_id USING ERRCODE = '22023';
  END IF;

  -- Permessi: stessa company + (owner || company_admin)
  IF v_dashboard.company_id <> v_company_id THEN
    RAISE EXCEPTION 'Cross-company dashboard access denied' USING ERRCODE = '42501';
  END IF;

  IF v_dashboard.owner_id <> v_user_id
     AND NOT public.has_role(v_user_id, 'company_admin'::app_role) THEN
    RAISE EXCEPTION 'Only owner or company_admin can modify this dashboard' USING ERRCODE = '42501';
  END IF;

  -- Aggiorna metadati (solo se diversi; name non può diventare NULL)
  UPDATE public.dashboards
  SET name        = COALESCE(NULLIF(btrim(p_name), ''), v_dashboard.name),
      description = COALESCE(p_description, v_dashboard.description),
      scope       = p_scope,
      icon        = COALESCE(p_icon, v_dashboard.icon)
  WHERE id = p_dashboard_id;

  -- Calcola prossima versione
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_ver
  FROM public.dashboard_versions
  WHERE dashboard_id = p_dashboard_id;

  -- Sposta is_current sulla nuova versione (unique index WHERE is_current=true
  -- richiede prima un UPDATE a false della corrente)
  UPDATE public.dashboard_versions
  SET is_current = false
  WHERE dashboard_id = p_dashboard_id AND is_current = true;

  INSERT INTO public.dashboard_versions (
    dashboard_id, version, layout, is_current, created_by, note
  ) VALUES (
    p_dashboard_id, v_next_ver, p_layout, true, v_user_id, p_note
  ) RETURNING id INTO v_new_ver_id;

  RETURN jsonb_build_object(
    'dashboard_id', p_dashboard_id,
    'version_id',   v_new_ver_id,
    'version',      v_next_ver,
    'is_current',   true,
    'created',      false
  );
END $$;

COMMENT ON FUNCTION public.save_dashboard(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) IS
  'Crea o aggiorna una dashboard. Ogni save genera una nuova versione immutabile con is_current=true.';

-- Grant esecuzione agli utenti autenticati
REVOKE ALL ON FUNCTION public.save_dashboard(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_dashboard(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public._dashboard_validate_layout(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._dashboard_validate_layout(JSONB) TO authenticated;
