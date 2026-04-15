-- ════════════════════════════════════════════════════════════════
-- Sprint 1.18 — RPC resolve_dashboard (batch resolver)
-- ════════════════════════════════════════════════════════════════
-- Risolve TUTTI i widget della dashboard in una sola chiamata.
-- Il frontend invece di fare N chiamate get_metric ne fa 1 sola.
--
-- Input:
--   p_dashboard_id UUID
--   p_override_filters JSONB  -- opzionale, override dei globalFilters
--
-- Output:
--   {
--     dashboard_id: UUID,
--     version: int,
--     resolved_at: timestamp,
--     widgets: {
--       <widget_id>: { status: 'ok' | 'error' | 'skipped',
--                      value?: number, breakdown?: [...], meta?: {...},
--                      error?: string }
--     }
--   }
--
-- Ogni widget viene risolto in try/catch: un widget che fallisce NON
-- blocca gli altri. I widget statici (text_markdown, divider) sono skipped.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.resolve_dashboard(
  p_dashboard_id     UUID,
  p_override_filters JSONB DEFAULT NULL
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
  v_version     public.dashboard_versions%ROWTYPE;
  v_widgets     JSONB;
  v_widget      JSONB;
  v_widget_id   TEXT;
  v_widget_type TEXT;
  v_metric_id   TEXT;
  v_agg         TEXT;
  v_breakdown   TEXT;
  v_filters     JSONB;
  v_global      JSONB;
  v_result      JSONB;
  v_resolved    JSONB := '{}'::jsonb;
  v_err         TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context' USING ERRCODE = '42501';
  END IF;

  -- Carica dashboard + visibilità
  SELECT * INTO v_dashboard FROM public.dashboards WHERE id = p_dashboard_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dashboard % not found', p_dashboard_id USING ERRCODE = '22023';
  END IF;

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

  -- Carica layout corrente
  SELECT * INTO v_version FROM public.dashboard_versions
  WHERE dashboard_id = p_dashboard_id AND is_current = true LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'dashboard_id', p_dashboard_id,
      'version',      0,
      'resolved_at',  NOW(),
      'widgets',      '{}'::jsonb
    );
  END IF;

  v_widgets := COALESCE(v_version.layout->'widgets', '[]'::jsonb);
  v_global  := COALESCE(v_version.layout->'globalFilters', '{}'::jsonb);

  -- Merge override filtri: override > widget.config.filter > globalFilters
  -- (i widget filter specifici vengono applicati nel loop)

  FOR v_widget IN SELECT * FROM jsonb_array_elements(v_widgets)
  LOOP
    v_widget_id   := v_widget->>'id';
    v_widget_type := v_widget->>'type';
    v_metric_id   := v_widget->'config'->>'metric';
    v_agg         := v_widget->'config'->>'aggregation';
    v_breakdown   := COALESCE(v_widget->'config'->>'breakdown', 'none');

    -- Widget statici: skip
    IF v_widget_type IN ('text_markdown', 'divider') OR v_metric_id IS NULL THEN
      v_resolved := v_resolved || jsonb_build_object(
        v_widget_id,
        jsonb_build_object('status', 'skipped', 'reason', 'no_metric')
      );
      CONTINUE;
    END IF;

    -- Merge filtri: globalFilters + widget.config.filter + override
    v_filters := v_global
               || COALESCE(v_widget->'config'->'filter', '{}'::jsonb)
               || COALESCE(p_override_filters, '{}'::jsonb);

    -- Invoca get_metric con try/catch
    BEGIN
      v_result := public.get_metric(v_metric_id, v_filters, v_agg, v_breakdown);

      v_resolved := v_resolved || jsonb_build_object(
        v_widget_id,
        jsonb_build_object(
          'status',    'ok',
          'value',     v_result->'value',
          'breakdown', v_result->'breakdown',
          'meta',      v_result->'meta'
        )
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_resolved := v_resolved || jsonb_build_object(
        v_widget_id,
        jsonb_build_object('status', 'error', 'error', v_err, 'metric', v_metric_id)
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'dashboard_id', p_dashboard_id,
    'version',      v_version.version,
    'resolved_at',  NOW(),
    'widgets',      v_resolved,
    'applied_filters', jsonb_build_object(
      'global',   v_global,
      'override', COALESCE(p_override_filters, '{}'::jsonb)
    )
  );
END $$;

COMMENT ON FUNCTION public.resolve_dashboard(UUID, JSONB) IS
  'Batch resolver: risolve tutti i widget della dashboard in un call. Widget in errore non bloccano gli altri (status=error).';

REVOKE ALL ON FUNCTION public.resolve_dashboard(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_dashboard(UUID, JSONB) TO authenticated;
