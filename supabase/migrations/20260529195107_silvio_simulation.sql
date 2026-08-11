-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.silvio_tool_simula_scenario(
  p_company_id uuid, p_ipotesi text, p_orizzonte integer DEFAULT 6, p_variabili jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_weeks int; v_cf jsonb; v_pipe jsonb; v_workload jsonb;
  v_nuova numeric; v_costo numeric; v_net numeric;
  v_base_min numeric; v_base_fine numeric; v_scenario_min numeric; v_scenario_fine numeric;
  v_leve jsonb; v_overload int; v_free int;
  v_mesi int := GREATEST(coalesce(p_orizzonte, 6), 1);
BEGIN
  IF p_company_id IS NULL OR coalesce(p_ipotesi, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company_id e ipotesi obbligatori');
  END IF;
  v_weeks := LEAST(v_mesi * 4 + 2, 52);
  v_cf := public.silvio_cashflow_forecast_90d(p_company_id, v_weeks, true);
  BEGIN v_pipe := public.silvio_tool_get_pipeline_forecast(p_company_id, v_mesi * 30);
  EXCEPTION WHEN OTHERS THEN v_pipe := NULL; END;

  v_base_min  := coalesce((v_cf->>'saldo_minimo_eur')::numeric, 0);
  v_base_fine := coalesce((v_cf->>'saldo_atteso_fine_periodo_eur')::numeric, 0);
  v_nuova := coalesce((p_variabili->>'nuova_commessa_eur')::numeric, 0);
  v_costo := coalesce((p_variabili->>'costo_fornitori_eur')::numeric,
                      CASE WHEN v_nuova > 0 THEN round(v_nuova * 0.65, 2) ELSE 0 END);
  v_net := v_nuova - v_costo;
  v_scenario_fine := v_base_fine + v_net;
  v_scenario_min := v_base_min + CASE
    WHEN coalesce((p_variabili->>'incasso_giorni')::int, 9999) <= v_mesi * 30 THEN v_net ELSE 0 END;

  BEGIN
    SELECT coalesce(jsonb_agg(e ORDER BY (e->>'importo')::numeric DESC), '[]'::jsonb) INTO v_leve
    FROM (
      SELECT e FROM (
        SELECT jsonb_build_object('cliente', coalesce(o.client_name, o.client_company, o.order_code),
                                  'tipo', 'acconto', 'importo', o.deposit_amount, 'atteso_il', o.deposit_expected_date) AS e
        FROM public.orders o
        WHERE o.company_id = p_company_id AND coalesce(o.deposit_paid, false) = false
          AND o.deposit_expected_date IS NOT NULL AND coalesce(o.deposit_amount, 0) > 0
          AND o.deposit_expected_date <= CURRENT_DATE + (v_mesi * 30)
        UNION ALL
        SELECT jsonb_build_object('cliente', coalesce(o.client_name, o.client_company, o.order_code),
                                  'tipo', 'saldo', 'importo', o.balance_amount, 'atteso_il', o.balance_expected_date)
        FROM public.orders o
        WHERE o.company_id = p_company_id AND coalesce(o.balance_paid, false) = false
          AND o.balance_expected_date IS NOT NULL AND coalesce(o.balance_amount, 0) > 0
          AND o.balance_expected_date <= CURRENT_DATE + (v_mesi * 30)
      ) u
      ORDER BY (e->>'importo')::numeric DESC
      LIMIT 3
    ) t;
  EXCEPTION WHEN OTHERS THEN v_leve := '[]'::jsonb; END;

  BEGIN
    v_workload := public.silvio_employees_workload(p_company_id);
    SELECT count(*) FILTER (WHERE (w->>'utilizzo_pct')::numeric >= 85),
           count(*) FILTER (WHERE (w->>'stato_carico') = 'libero')
      INTO v_overload, v_free
    FROM jsonb_array_elements(v_workload) w;
  EXCEPTION WHEN OTHERS THEN v_overload := NULL; v_free := NULL; END;

  RETURN jsonb_build_object(
    'ok', true, 'ipotesi', p_ipotesi, 'orizzonte_mesi', v_mesi, 'variabili', p_variabili,
    'cassa', jsonb_build_object(
      'saldo_oggi_eur', (v_cf->>'saldo_oggi_eur')::numeric,
      'saldo_minimo_base_eur', v_base_min,
      'settimana_critica', v_cf->>'settimana_critica',
      'settimane_critiche', (v_cf->>'critical_weeks_count')::int,
      'saldo_fine_periodo_base_eur', v_base_fine,
      'costo_personale_mensile_eur', (v_cf->>'costo_personale_mensile_netto_eur')::numeric),
    'scenario', jsonb_build_object(
      'nuova_commessa_eur', v_nuova, 'costo_stimato_eur', v_costo, 'impatto_netto_eur', v_net,
      'saldo_minimo_stimato_eur', v_scenario_min, 'saldo_fine_periodo_stimato_eur', v_scenario_fine,
      'regge', (v_scenario_min >= 0)),
    'pipeline', CASE WHEN v_pipe IS NULL THEN NULL ELSE jsonb_build_object(
      'weighted_eur', (v_pipe->>'pipeline_weighted_eur')::numeric,
      'forecast_90d_eur', (v_pipe->>'forecast_90d_eur')::numeric) END,
    'squadre', jsonb_build_object('sovraccarichi', v_overload, 'liberi', v_free),
    'leve_incassi_anticipabili', v_leve,
    'nota', 'Stima composita read-only su forecast cassa reale + ipotesi. Non modifica dati. Costo commessa stimato al 65% se non specificato in variabili.'
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.silvio_tool_simula_scenario(uuid, text, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_tool_simula_scenario(uuid, text, integer, jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION public.silvio_tool_simula_scenario(uuid, text, integer, jsonb) IS
  'MP-SILVIO-SIMULATION-01: scenario what-if composito (cassa+pipeline+squadre+variabili), sola lettura. Silvio narra il risultato.';
