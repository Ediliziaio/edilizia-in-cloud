-- ════════════════════════════════════════════════════════════════
-- Sprint 1.16 — RPC list_dashboards + get_dashboard
-- ════════════════════════════════════════════════════════════════
-- list_dashboards(): elenco dashboard visibili all'utente corrente
--   Returns: array di { id, name, description, scope, icon,
--                       is_default, is_owner, current_version, updated_at }
--
-- get_dashboard(p_dashboard_id UUID): dashboard + layout versione corrente
--   Returns: { dashboard: {...}, version: { version, layout, note, created_at },
--              can_edit: bool, versions_count: int }
--
-- Entrambi filtrati da RLS (scope personal/company/role) — la RPC è un
-- convenience wrapper per evitare N+1 e includere flags derivate.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.list_dashboards()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_company_id UUID;
  v_result     JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_jsonb(x) ORDER BY x.is_default DESC, x.updated_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      d.id,
      d.name,
      d.description,
      d.scope,
      d.icon,
      d.is_default,
      (d.owner_id = v_user_id) AS is_owner,
      d.updated_at,
      d.created_at,
      (d.owner_id = v_user_id
        OR public.has_role(v_user_id, 'company_admin'::app_role)) AS can_edit,
      (SELECT version FROM public.dashboard_versions dv
        WHERE dv.dashboard_id = d.id AND dv.is_current = true LIMIT 1) AS current_version,
      (SELECT COUNT(*) FROM public.dashboard_versions dv WHERE dv.dashboard_id = d.id)::int AS versions_count
    FROM public.dashboards d
    WHERE d.company_id = v_company_id
      AND (
        d.scope = 'company'
        OR (d.scope = 'personal' AND d.owner_id = v_user_id)
        OR (d.scope LIKE 'role:%' AND public.has_role(v_user_id, SUBSTRING(d.scope FROM 6)::app_role))
      )
  ) x;

  RETURN v_result;
END $$;

COMMENT ON FUNCTION public.list_dashboards() IS
  'Elenco dashboard visibili all''utente (personal proprie + company + role). Include flag can_edit e count versioni.';

-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_dashboard(p_dashboard_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_company_id UUID;
  v_dashboard  public.dashboards%ROWTYPE;
  v_version    public.dashboard_versions%ROWTYPE;
  v_can_edit   BOOLEAN;
  v_count      INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_dashboard FROM public.dashboards WHERE id = p_dashboard_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dashboard % not found', p_dashboard_id USING ERRCODE = '22023';
  END IF;

  -- Enforce visibilità (doppia barriera rispetto a RLS per sicurezza in SECURITY DEFINER)
  IF v_dashboard.company_id <> v_company_id THEN
    RAISE EXCEPTION 'Dashboard not visible' USING ERRCODE = '42501';
  END IF;

  IF NOT (
       v_dashboard.scope = 'company'
    OR (v_dashboard.scope = 'personal' AND v_dashboard.owner_id = v_user_id)
    OR (v_dashboard.scope LIKE 'role:%' AND public.has_role(v_user_id, SUBSTRING(v_dashboard.scope FROM 6)::app_role))
  ) THEN
    RAISE EXCEPTION 'Dashboard not visible' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_version FROM public.dashboard_versions
  WHERE dashboard_id = p_dashboard_id AND is_current = true
  LIMIT 1;

  IF NOT FOUND THEN
    -- Dashboard senza versione corrente: layout vuoto
    v_version.version := 0;
    v_version.layout := jsonb_build_object('widgets', '[]'::jsonb);
    v_version.note := NULL;
    v_version.created_at := NULL;
  END IF;

  v_can_edit := (v_dashboard.owner_id = v_user_id)
                OR public.has_role(v_user_id, 'company_admin'::app_role);

  SELECT COUNT(*)::int INTO v_count FROM public.dashboard_versions
  WHERE dashboard_id = p_dashboard_id;

  -- Traccia "ultima aperta"
  INSERT INTO public.dashboard_user_prefs (user_id, last_dashboard_id, last_opened_at)
  VALUES (v_user_id, p_dashboard_id, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET last_dashboard_id = EXCLUDED.last_dashboard_id,
        last_opened_at    = EXCLUDED.last_opened_at;

  RETURN jsonb_build_object(
    'dashboard', jsonb_build_object(
      'id',          v_dashboard.id,
      'name',        v_dashboard.name,
      'description', v_dashboard.description,
      'scope',       v_dashboard.scope,
      'icon',        v_dashboard.icon,
      'is_default',  v_dashboard.is_default,
      'owner_id',    v_dashboard.owner_id,
      'company_id',  v_dashboard.company_id,
      'created_at',  v_dashboard.created_at,
      'updated_at',  v_dashboard.updated_at
    ),
    'version', jsonb_build_object(
      'version',    v_version.version,
      'layout',     v_version.layout,
      'note',       v_version.note,
      'created_at', v_version.created_at
    ),
    'can_edit',       v_can_edit,
    'versions_count', v_count
  );
END $$;

COMMENT ON FUNCTION public.get_dashboard(UUID) IS
  'Carica dashboard + layout versione corrente. Aggiorna dashboard_user_prefs.last_opened_at.';

-- ════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.list_dashboards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_dashboards() TO authenticated;

REVOKE ALL ON FUNCTION public.get_dashboard(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard(UUID) TO authenticated;
