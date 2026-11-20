SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.previsionale_liquidazioni_iva(p_company_id uuid, p_oggi date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_anno int := extract(year FROM p_oggi)::int;
  v_anno_esercizio int;
  v_report record;
  v_imp public.fiscalita_impostazioni_iva;
  v_operazioni jsonb := '[]'::jsonb;
  v_avvisi jsonb := '[]'::jsonb;
  v_r jsonb;
  v_regola jsonb;
  v_stima boolean;
  v_puo_calcolare boolean;
  v_residuo numeric;
  v_scadenza date;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  IF p_oggi IS NULL OR v_anno NOT BETWEEN 2000 AND 2100 THEN
    RAISE EXCEPTION 'Data della previsione non valida' USING ERRCODE = '22023';
  END IF;
  IF NOT public.ai_is_service_role() AND NOT (
     coalesce(public.has_permission_for_company(auth.uid(),'can_view_forecast', p_company_id),false)
     OR coalesce(public.has_permission_for_company(auth.uid(),'can_view_controllo_gestione', p_company_id),false)
     OR coalesce(public.user_can_read_accountant_company(p_company_id),false)
  ) THEN
    RAISE EXCEPTION 'Non puoi vedere le previsioni IVA di questa azienda' USING ERRCODE = '42501';
  END IF;
  v_puo_calcolare := auth.uid() IS NOT NULL AND (
    coalesce(public.e_amministratore_di(p_company_id),false)
    OR coalesce(public.has_role(auth.uid(),'super_admin'::public.app_role),false)
    OR coalesce(public.user_can_write_accountant_company(p_company_id),false)
  );

  -- Liquidazioni confermate e stime possibili condividono tributo e calendario.
  -- Gli F24 già presenti sono già letti dal Previsionale, anche se pagati.
  FOR v_report IN
    WITH impostazioni AS (
      SELECT i.* FROM public.fiscalita_impostazioni_iva i
        WHERE i.company_id = p_company_id AND i.anno BETWEEN v_anno - 1 AND v_anno
    ), confermate AS (
      SELECT f.period_start dal, f.data_summary dati, true confermata
      FROM public.fiscal_reports f
      WHERE f.company_id=p_company_id AND f.report_type='lipe'
        AND f.period_start BETWEEN make_date(v_anno-1,1,1) AND p_oggi
        AND f.status IN ('reviewed_commercialista','submitted','accepted_ade','rejected_ade')
    ), candidati AS (
      SELECT i.anno, p.periodo,
        make_date(i.anno, CASE WHEN i.periodicita='mensile' THEN p.periodo ELSE (p.periodo-1)*3+1 END,1) AS dal,
        CASE WHEN i.periodicita='mensile' THEN p.periodo END AS mese,
        CASE WHEN i.periodicita='trimestrale' AND p.periodo = 4 THEN 5
          WHEN i.periodicita<>'mensile' THEN p.periodo END AS trimestre
      FROM impostazioni i
      CROSS JOIN LATERAL generate_series(1,CASE WHEN i.periodicita='mensile' THEN 12 ELSE 4 END) p(periodo)
      WHERE v_puo_calcolare AND i.periodicita IS NOT NULL AND i.regime='ordinario'
        AND NOT i.attivita_separate AND NOT i.iva_per_cassa
    )
    SELECT dal,dati,confermata,null::int periodo FROM confermate
    UNION ALL
    SELECT c.dal, NULL::jsonb, false, c.periodo FROM candidati c
    WHERE c.dal <= p_oggi AND NOT EXISTS(SELECT 1 FROM confermate f WHERE f.dal=c.dal)
      AND (private.f24_iva_versamento(c.anno,c.mese,c.trimestre,101)->>'scadenza')::date >= p_oggi
    ORDER BY 1
  LOOP
    v_anno_esercizio := extract(year FROM v_report.dal)::int;
    v_stima := NOT v_report.confermata;
    IF v_stima THEN
      v_r := public.liquidazione_iva_righi(p_company_id,v_anno_esercizio,v_report.periodo,'{}'::jsonb);
      IF coalesce((v_r->>'calcolabile')::boolean,false) IS NOT TRUE THEN
        v_avvisi := v_avvisi || jsonb_build_array(
          format('Stima IVA %s non disponibile. %s',to_char(v_report.dal,'MM/YYYY'),coalesce(v_r->>'motivo','Completa la liquidazione.')));
        CONTINUE;
      END IF;
    ELSE
      v_r := v_report.dati;
    END IF;

    v_regola := private.f24_iva_da_liquidazione(v_r,v_report.dal);
    IF v_regola->>'stato' <> 'da_versare' OR EXISTS (
      SELECT 1 FROM public.f24_entries f WHERE f.company_id=p_company_id AND f.anno=v_anno_esercizio
        AND f.mese=(v_regola->>'mese')::int AND f.tributo_code=v_regola->>'codice' AND f.stato<>'annullato'
    ) THEN CONTINUE; END IF;
    v_residuo := (v_regola->>'importo')::numeric;
    v_scadenza := (v_regola->>'scadenza')::date;
    v_operazioni := v_operazioni || jsonb_build_array(jsonb_build_object(
      'id', 'liquidazione-iva:' || v_report.dal, 'description', 'IVA da versare · ' || coalesce(v_r->>'etichetta',to_char(v_report.dal,'MM/YYYY')),
      'counterparty', 'Erario', 'category', 'fisco', 'direction', 'out', 'cents', round(v_residuo*100)::bigint, 'date', v_scadenza,
      'source', CASE WHEN v_stima THEN 'Stima IVA' ELSE 'Liquidazione IVA' END,
      'href', '/azienda/contabilita-fiscale', 'estimated', v_stima
    ));
  END LOOP;

  SELECT * INTO v_imp FROM public.fiscalita_impostazioni_iva i WHERE i.company_id=p_company_id AND i.anno=v_anno;
  IF v_imp.company_id IS NULL THEN
    v_avvisi := v_avvisi || jsonb_build_array('Compila le Impostazioni IVA dell’anno per stimare i versamenti.');
  ELSIF v_imp.iva_per_cassa OR v_imp.attivita_separate OR v_imp.regime = 'altro' THEN
    v_avvisi := v_avvisi || jsonb_build_array('Il regime IVA richiede il riscontro con il consulente per stimare i versamenti.');
  END IF;
  RETURN jsonb_build_object('movements',v_operazioni,'warnings',v_avvisi);
END $$;

REVOKE ALL ON FUNCTION public.previsionale_liquidazioni_iva(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsionale_liquidazioni_iva(uuid,date) TO authenticated, service_role;
