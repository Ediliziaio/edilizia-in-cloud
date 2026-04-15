-- ════════════════════════════════════════════════════════════════
-- FIX: list_dashboards row_to_jsonb(record) does not exist
-- ════════════════════════════════════════════════════════════════
-- Causa: row_to_jsonb/to_jsonb su alias di subquery anonima (x.*)
--        Postgres non tipa il record.
-- Fix: costruire jsonb_build_object esplicito nella SELECT e
--      jsonb_agg direttamente sul jsonb risultante.
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

  SELECT COALESCE(jsonb_agg(item ORDER BY is_default DESC, updated_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      d.is_default,
      d.updated_at,
      jsonb_build_object(
        'id',              d.id,
        'name',            d.name,
        'description',     d.description,
        'scope',           d.scope,
        'icon',            d.icon,
        'is_default',      d.is_default,
        'is_owner',        (d.owner_id = v_user_id),
        'can_edit',        (d.owner_id = v_user_id
                            OR public.has_role(v_user_id, 'company_admin'::app_role)),
        'current_version', (SELECT version FROM public.dashboard_versions dv
                            WHERE dv.dashboard_id = d.id AND dv.is_current = true LIMIT 1),
        'versions_count',  (SELECT COUNT(*)::int FROM public.dashboard_versions dv
                            WHERE dv.dashboard_id = d.id),
        'updated_at',      d.updated_at,
        'created_at',      d.created_at
      ) AS item
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
