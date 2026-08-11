-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Salute costi AI per il super_admin: spike (oggi vs media 7g) + per-modello
-- (chiamate, error-rate, costo, latenza, % fallback). Gate super_admin/service_role.
CREATE OR REPLACE FUNCTION public.admin_ai_cost_health(p_days int DEFAULT 14)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  n int := greatest(1, least(coalesce(p_days,14), 90));
  res jsonb;
  v_oggi numeric; v_ieri numeric; v_media7 numeric;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR coalesce(auth.jwt() ->> 'role','') = 'service_role') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(sum(cost_real_eur) FILTER (WHERE created_at::date = current_date), 0),
         coalesce(sum(cost_real_eur) FILTER (WHERE created_at::date = current_date - 1), 0)
  INTO v_oggi, v_ieri
  FROM ai_call_ledger WHERE created_at >= current_date - 1;

  SELECT coalesce(avg(g.tot), 0) INTO v_media7 FROM (
    SELECT created_at::date AS d, sum(cost_real_eur) AS tot
    FROM ai_call_ledger
    WHERE created_at >= current_date - 7 AND created_at < current_date
    GROUP BY 1
  ) g;

  SELECT jsonb_build_object(
    'ok', true,
    'finestra_giorni', n,
    'spike', jsonb_build_object(
      'oggi_eur', round(v_oggi, 4),
      'ieri_eur', round(v_ieri, 4),
      'media_7g_eur', round(v_media7, 4),
      'delta_vs_media_pct', CASE WHEN v_media7 > 0 THEN round((v_oggi - v_media7) / v_media7 * 100, 1) ELSE NULL END,
      'is_spike', (v_oggi > 1.5 * v_media7 AND v_oggi > 1.0)
    ),
    'per_modello', (
      SELECT coalesce(jsonb_agg(m ORDER BY (m->>'costo_eur')::numeric DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'model', model_used,
          'chiamate', count(*),
          'errori', count(*) FILTER (WHERE status = 'error'),
          'error_rate_pct', round((count(*) FILTER (WHERE status = 'error'))::numeric
                                   / nullif(count(*) FILTER (WHERE status IN ('success','error')), 0) * 100, 1),
          'costo_eur', round(coalesce(sum(cost_real_eur), 0), 4),
          'durata_media_ms', round(coalesce(avg(duration_ms) FILTER (WHERE status = 'success'), 0)),
          'fallback_pct', round((count(*) FILTER (WHERE used_primary = false))::numeric / nullif(count(*), 0) * 100, 1)
        ) AS m
        FROM ai_call_ledger
        WHERE created_at >= current_date - n AND model_used IS NOT NULL
        GROUP BY model_used
      ) q
    ),
    'totali', (
      SELECT jsonb_build_object(
        'chiamate', count(*),
        'errori', count(*) FILTER (WHERE status = 'error'),
        'error_rate_pct', round((count(*) FILTER (WHERE status = 'error'))::numeric
                                 / nullif(count(*) FILTER (WHERE status IN ('success','error')), 0) * 100, 1),
        'costo_eur', round(coalesce(sum(cost_real_eur), 0), 4)
      )
      FROM ai_call_ledger WHERE created_at >= current_date - n
    )
  ) INTO res;
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.admin_ai_cost_health(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_cost_health(int) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_ai_cost_health(int) IS 'Salute costi AI super_admin: spike oggi-vs-media7 + breakdown per modello (error-rate, costo, latenza, fallback).';
