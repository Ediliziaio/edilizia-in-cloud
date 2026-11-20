SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- L'aging usa le stesse scadenze, esplicite e derivate, dello Scadenzario.
CREATE OR REPLACE FUNCTION public.cg_get_aging(
  p_company_id uuid DEFAULT NULL, p_direction text DEFAULT 'out'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_company uuid := coalesce(p_company_id, public.get_my_company_id());
  v_oggi date := (now() AT TIME ZONE 'Europe/Rome')::date;
  v_direction text := CASE lower(p_direction) WHEN 'in' THEN 'entrata' WHEN 'out' THEN 'uscita' ELSE lower(p_direction) END;
  v_result jsonb;
BEGIN
  PERFORM public._cg_assert_lettura(p_company_id);
  IF v_company IS NULL OR (v_company IS DISTINCT FROM public.get_my_company_id()
      AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF v_direction IS NULL OR v_direction NOT IN ('entrata','uscita') THEN
    RAISE EXCEPTION 'Direzione scadenza non valida' USING ERRCODE = '22023';
  END IF;

  WITH dovuto AS (
    SELECT s.id, s.description, s.due_date, s.amount - coalesce(s.paid_amount,0) AS residuo,
           s.supplier_id, s.contact_id,
           CASE WHEN s.due_date IS NULL THEN 'senza_data'
                WHEN s.due_date >= v_oggi THEN 'a_scadere'
                WHEN s.due_date >= v_oggi - 30 THEN 'sc_30'
                WHEN s.due_date >= v_oggi - 60 THEN 'sc_60'
                WHEN s.due_date >= v_oggi - 90 THEN 'sc_90'
                ELSE 'sc_oltre' END AS fascia
      FROM public.scadenzario_fonti(v_company) s
     WHERE s.company_id = v_company AND s.direction = v_direction
       AND lower(coalesce(s.status::text,'')) IN ('da_pagare','parziale','pending','partial','unpaid','overdue')
       AND s.amount > coalesce(s.paid_amount,0)
  ), fasce AS (
    SELECT fascia, sum(residuo) AS totale FROM dovuto GROUP BY fascia
  ), righe AS (
    SELECT jsonb_agg(jsonb_build_object(
      'id', d.id, 'descrizione', d.description, 'due_date', d.due_date, 'residuo', d.residuo, 'fascia', d.fascia,
      'controparte', coalesce(s.name, c.company_name, nullif(concat_ws(' ', c.first_name, c.last_name),''))
    ) ORDER BY d.due_date NULLS LAST, d.id) AS elenco
    FROM dovuto d
    LEFT JOIN public.suppliers s ON s.id = d.supplier_id AND s.company_id = v_company
    LEFT JOIN public.marketing_contacts c ON c.id = d.contact_id AND c.company_id = v_company
  )
  SELECT jsonb_build_object(
    'direction', p_direction, 'totale', coalesce(sum(residuo),0), 'n_aperte', count(*),
    'totale_scaduto', coalesce(sum(residuo) FILTER (WHERE due_date < v_oggi),0),
    'n_scadute', count(*) FILTER (WHERE due_date < v_oggi),
    'fasce', '{"a_scadere":0,"senza_data":0,"sc_30":0,"sc_60":0,"sc_90":0,"sc_oltre":0}'::jsonb
      || coalesce((SELECT jsonb_object_agg(fascia, totale) FROM fasce),'{}'::jsonb),
    'righe', coalesce((SELECT elenco FROM righe),'[]'::jsonb)
  ) INTO v_result FROM dovuto;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.cg_get_aging(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_aging(uuid,text) TO authenticated, service_role;
