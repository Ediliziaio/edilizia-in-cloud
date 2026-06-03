-- Serie dati reali per i grafici di Silvio (company-scoped). Ritorna una struttura
-- {ok, titolo, unita, x_label, data:[{label,value}]} pronta per un blocco ```chart```.
CREATE OR REPLACE FUNCTION public.silvio_tool_serie_grafico(
  p_company_id uuid,
  p_metric text DEFAULT 'fatturato_mensile',
  p_mesi int DEFAULT 12
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n int := greatest(3, least(coalesce(p_mesi, 12), 36));
  da date := (date_trunc('month', now()) - ((greatest(3, least(coalesce(p_mesi,12),36)) - 1) || ' months')::interval)::date;
  mese_abbr text[] := ARRAY['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  res jsonb;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company_id mancante');
  END IF;

  IF p_metric = 'fatturato_mensile' THEN
    WITH months AS (SELECT generate_series(da, date_trunc('month', now())::date, '1 month')::date AS m),
    agg AS (
      SELECT date_trunc('month', coalesce(data_emissione, created_at::date))::date AS m, sum(coalesce(totale_documento,0)) AS v
      FROM documenti_fiscali
      WHERE company_id = p_company_id AND deleted_at IS NULL
        AND tipo IN ('fattura','fattura_pa','nota_credito','autofattura','fattura_riepilogativa')
        AND coalesce(data_emissione, created_at::date) >= da
      GROUP BY 1)
    SELECT jsonb_build_object('ok',true,'metric',p_metric,'titolo','Fatturato per mese','unita','€','x_label','mese',
      'data', coalesce(jsonb_agg(jsonb_build_object('label', mese_abbr[extract(month from months.m)::int]||' '||to_char(months.m,'YY'), 'value', round(coalesce(agg.v,0),2)) ORDER BY months.m), '[]'::jsonb))
    INTO res FROM months LEFT JOIN agg ON agg.m = months.m;

  ELSIF p_metric = 'incassi_mensili' THEN
    WITH months AS (SELECT generate_series(da, date_trunc('month', now())::date, '1 month')::date AS m),
    agg AS (
      SELECT date_trunc('month', pagato_at)::date AS m, sum(coalesce(importo_pagato,0)) AS v
      FROM documenti_fiscali
      WHERE company_id = p_company_id AND deleted_at IS NULL AND pagato_at IS NOT NULL AND pagato_at >= da
      GROUP BY 1)
    SELECT jsonb_build_object('ok',true,'metric',p_metric,'titolo','Incassi per mese','unita','€','x_label','mese',
      'data', coalesce(jsonb_agg(jsonb_build_object('label', mese_abbr[extract(month from months.m)::int]||' '||to_char(months.m,'YY'), 'value', round(coalesce(agg.v,0),2)) ORDER BY months.m), '[]'::jsonb))
    INTO res FROM months LEFT JOIN agg ON agg.m = months.m;

  ELSIF p_metric = 'cantieri_per_stato' THEN
    SELECT jsonb_build_object('ok',true,'metric',p_metric,'titolo','Commesse per stato','unita',null,'x_label','stato',
      'data', coalesce(jsonb_agg(jsonb_build_object('label', stato, 'value', c) ORDER BY c DESC), '[]'::jsonb))
    INTO res FROM (SELECT coalesce(status,'(n/d)') AS stato, count(*) AS c FROM orders WHERE company_id = p_company_id GROUP BY 1) q;

  ELSIF p_metric = 'documenti_per_tipo' THEN
    SELECT jsonb_build_object('ok',true,'metric',p_metric,'titolo','Documenti per tipo','unita',null,'x_label','tipo',
      'data', coalesce(jsonb_agg(jsonb_build_object('label', tipo, 'value', c) ORDER BY c DESC), '[]'::jsonb))
    INTO res FROM (SELECT coalesce(tipo,'(n/d)') AS tipo, count(*) AS c FROM documenti_fiscali
      WHERE company_id = p_company_id AND deleted_at IS NULL AND coalesce(data_emissione, created_at::date) >= da GROUP BY 1) q;

  ELSE
    res := jsonb_build_object('ok', false, 'error', 'metric non supportata',
      'metriche_disponibili', jsonb_build_array('fatturato_mensile','incassi_mensili','cantieri_per_stato','documenti_per_tipo'));
  END IF;

  RETURN res;
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_serie_grafico(uuid,text,int) FROM public;
GRANT EXECUTE ON FUNCTION public.silvio_tool_serie_grafico(uuid,text,int) TO authenticated, service_role;
COMMENT ON FUNCTION public.silvio_tool_serie_grafico(uuid,text,int) IS 'Serie dati per i grafici di Silvio (company-scoped): fatturato/incassi mensili, commesse per stato, documenti per tipo.';
