-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.silvio_admin_serie_grafico(
  p_metric text DEFAULT 'nuove_aziende_mensili',
  p_mesi int DEFAULT 12
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n int := greatest(3, least(coalesce(p_mesi, 12), 36));
  da date := (date_trunc('month', now()) - ((greatest(3, least(coalesce(p_mesi,12),36)) - 1) || ' months')::interval)::date;
  mese_abbr text[] := ARRAY['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  res jsonb;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR coalesce(auth.jwt() ->> 'role','') = 'service_role') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_metric = 'nuove_aziende_mensili' THEN
    WITH months AS (SELECT generate_series(da, date_trunc('month', now())::date, '1 month')::date AS m),
    agg AS (SELECT date_trunc('month', created_at)::date AS m, count(*) AS v FROM companies WHERE created_at >= da GROUP BY 1)
    SELECT jsonb_build_object('ok',true,'metric',p_metric,'titolo','Nuove aziende per mese','unita',null,'x_label','mese',
      'data', coalesce(jsonb_agg(jsonb_build_object('label', mese_abbr[extract(month from months.m)::int]||' '||to_char(months.m,'YY'), 'value', coalesce(agg.v,0)) ORDER BY months.m), '[]'::jsonb))
    INTO res FROM months LEFT JOIN agg ON agg.m = months.m;

  ELSIF p_metric = 'aziende_per_stato' THEN
    SELECT jsonb_build_object('ok',true,'metric',p_metric,'titolo','Aziende per stato','unita',null,'x_label','stato',
      'data', coalesce(jsonb_agg(jsonb_build_object('label', stato, 'value', c) ORDER BY c DESC), '[]'::jsonb))
    INTO res FROM (SELECT coalesce(status,'(n/d)') AS stato, count(*) AS c FROM companies GROUP BY 1) q;

  ELSIF p_metric = 'mrr_movimenti_mensili' THEN
    SELECT jsonb_build_object('ok',true,'metric',p_metric,'titolo','Variazione MRR netta per mese','unita','€','x_label','mese',
      'data', coalesce(jsonb_agg(jsonb_build_object('label', month,
        'value', round(coalesce(new_mrr,0)+coalesce(expansion_mrr,0)-coalesce(contraction_mrr,0)-coalesce(churn_mrr,0), 2)) ORDER BY month), '[]'::jsonb))
    INTO res FROM get_mrr_movements_monthly(n);

  ELSE
    res := jsonb_build_object('ok', false, 'error', 'metric non supportata',
      'metriche_disponibili', jsonb_build_array('nuove_aziende_mensili','aziende_per_stato','mrr_movimenti_mensili'));
  END IF;

  RETURN res;
END $$;

REVOKE ALL ON FUNCTION public.silvio_admin_serie_grafico(text,int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_admin_serie_grafico(text,int) TO authenticated, service_role;
COMMENT ON FUNCTION public.silvio_admin_serie_grafico(text,int) IS 'Serie dati di piattaforma per i grafici del Silvio super_admin: nuove aziende/mese, aziende per stato, variazione MRR netta/mese. Gated super_admin/service_role.';
