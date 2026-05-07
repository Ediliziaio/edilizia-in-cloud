-- Silvio finance prompt/tool hardening:
-- distinguish fatturato, incasso and free cash after variable job costs.

CREATE OR REPLACE FUNCTION public.silvio_tool_revenue_needed_next_month(
  p_company_id uuid,
  p_target_month date DEFAULT NULL,
  p_margin_pct numeric DEFAULT 0.30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start date := DATE_TRUNC('month', COALESCE(p_target_month, CURRENT_DATE + INTERVAL '1 month'))::date;
  v_month_end date := (DATE_TRUNC('month', COALESCE(p_target_month, CURRENT_DATE + INTERVAL '1 month')) + INTERVAL '1 month - 1 day')::date;
  v_margin numeric := LEAST(GREATEST(COALESCE(p_margin_pct, 0.30), 0.05), 0.95);
  v_payroll_gross numeric := 0;
  v_payroll_net numeric := 0;
  v_open_costs_month numeric := 0;
  v_overdue_costs numeric := 0;
  v_open_costs_no_date numeric := 0;
  v_future_receivables numeric := 0;
  v_overdue_receivables numeric := 0;
  v_total_to_cover numeric := 0;
  v_available_receivables numeric := 0;
  v_cash_gap numeric := 0;
  v_revenue_target_by_margin numeric := 0;
  v_variable_cost_total_pct numeric := 0;
  v_upfront_variable_pct numeric := 0;
  v_standard_deposit_pct numeric := 0.50;
  v_protected_deposit_pct numeric := 0.70;
  v_standard_net_cash_pct numeric := 0;
  v_protected_net_cash_pct numeric := 0;
  v_standard_revenue_to_sign numeric := NULL;
  v_protected_revenue_to_sign numeric := NULL;
  v_recovery_required numeric := 0;
  v_mixed_recovery_amount numeric := 0;
  v_mixed_gap_after_recovery numeric := 0;
  v_mixed_new_revenue_protected numeric := 0;
  v_cost_details jsonb := '[]'::jsonb;
  v_overdue_clients jsonb := '[]'::jsonb;
  v_future_clients jsonb := '[]'::jsonb;
BEGIN
  SELECT
    COALESCE(SUM(gross_salary), 0),
    COALESCE(SUM(net_salary), 0)
  INTO v_payroll_gross, v_payroll_net
  FROM public.employees
  WHERE company_id = p_company_id
    AND COALESCE(is_active, true) = true;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_open_costs_month
  FROM public.company_costs
  WHERE company_id = p_company_id
    AND COALESCE(is_paid, false) = false
    AND due_date BETWEEN v_month_start AND v_month_end;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_overdue_costs
  FROM public.company_costs
  WHERE company_id = p_company_id
    AND COALESCE(is_paid, false) = false
    AND due_date < CURRENT_DATE;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_open_costs_no_date
  FROM public.company_costs
  WHERE company_id = p_company_id
    AND COALESCE(is_paid, false) = false
    AND due_date IS NULL;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'nome', name,
        'categoria', category,
        'tipo', cost_type,
        'importo_eur', ROUND(amount::numeric, 2),
        'scadenza', due_date,
        'stato', CASE
          WHEN due_date < CURRENT_DATE THEN 'scaduto'
          WHEN due_date BETWEEN v_month_start AND v_month_end THEN 'mese_target'
          WHEN due_date IS NULL THEN 'senza_data'
          ELSE 'fuori_periodo'
        END
      )
      ORDER BY due_date NULLS LAST, amount DESC
    ),
    '[]'::jsonb
  )
  INTO v_cost_details
  FROM public.company_costs
  WHERE company_id = p_company_id
    AND COALESCE(is_paid, false) = false
    AND (due_date < CURRENT_DATE OR due_date BETWEEN v_month_start AND v_month_end OR due_date IS NULL);

  WITH receivables AS (
    SELECT
      o.order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato') AS cliente,
      'acconto' AS tipo,
      COALESCE(o.deposit_amount, 0) AS importo_eur,
      o.deposit_expected_date AS data_attesa
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id AND COALESCE(o.deposit_paid, false) = false AND o.deposit_expected_date IS NOT NULL
    UNION ALL
    SELECT
      o.order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'acconto_2',
      COALESCE(o.deposit_2_amount, 0),
      o.deposit_2_expected_date
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id AND COALESCE(o.deposit_2_paid, false) = false AND o.deposit_2_expected_date IS NOT NULL
    UNION ALL
    SELECT
      o.order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'saldo',
      COALESCE(o.balance_amount, 0),
      o.balance_expected_date
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id AND COALESCE(o.balance_paid, false) = false AND o.balance_expected_date IS NOT NULL
    UNION ALL
    SELECT
      o.order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'finanziamento',
      COALESCE(o.financing_amount, 0),
      o.financing_expected_date
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id AND COALESCE(o.financing_paid, false) = false AND o.financing_expected_date IS NOT NULL
  )
  SELECT
    COALESCE(SUM(importo_eur) FILTER (WHERE data_attesa < CURRENT_DATE), 0),
    COALESCE(SUM(importo_eur) FILTER (WHERE data_attesa BETWEEN v_month_start AND v_month_end), 0),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'commessa', order_code,
          'cliente', cliente,
          'tipo_rata', tipo,
          'importo_eur', ROUND(importo_eur::numeric, 2),
          'data_attesa', data_attesa,
          'giorni_ritardo', CURRENT_DATE - data_attesa
        )
        ORDER BY data_attesa ASC, importo_eur DESC
      ) FILTER (WHERE data_attesa < CURRENT_DATE),
      '[]'::jsonb
    ),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'commessa', order_code,
          'cliente', cliente,
          'tipo_rata', tipo,
          'importo_eur', ROUND(importo_eur::numeric, 2),
          'data_attesa', data_attesa
        )
        ORDER BY data_attesa ASC, importo_eur DESC
      ) FILTER (WHERE data_attesa BETWEEN v_month_start AND v_month_end),
      '[]'::jsonb
    )
  INTO v_overdue_receivables, v_future_receivables, v_overdue_clients, v_future_clients
  FROM receivables;

  v_total_to_cover := v_payroll_gross + v_open_costs_month + v_overdue_costs;
  v_available_receivables := v_overdue_receivables + v_future_receivables;
  v_cash_gap := GREATEST(v_total_to_cover - v_available_receivables, 0);
  v_revenue_target_by_margin := CASE WHEN v_cash_gap = 0 THEN 0 ELSE v_cash_gap / v_margin END;

  v_variable_cost_total_pct := GREATEST(0, 1 - v_margin);
  v_upfront_variable_pct := LEAST(GREATEST(v_variable_cost_total_pct * 0.50, 0.15), 0.70);
  v_protected_deposit_pct := LEAST(GREATEST(v_upfront_variable_pct + 0.20, 0.70), 0.90);
  v_standard_net_cash_pct := v_standard_deposit_pct - v_upfront_variable_pct;
  v_protected_net_cash_pct := v_protected_deposit_pct - v_upfront_variable_pct;
  v_standard_revenue_to_sign := CASE
    WHEN v_cash_gap = 0 THEN 0
    WHEN v_standard_net_cash_pct > 0 THEN v_cash_gap / v_standard_net_cash_pct
    ELSE NULL
  END;
  v_protected_revenue_to_sign := CASE
    WHEN v_cash_gap = 0 THEN 0
    WHEN v_protected_net_cash_pct > 0 THEN v_cash_gap / v_protected_net_cash_pct
    ELSE NULL
  END;
  v_recovery_required := LEAST(v_cash_gap, v_overdue_receivables);
  v_mixed_recovery_amount := LEAST(v_cash_gap, v_overdue_receivables * 0.50);
  v_mixed_gap_after_recovery := GREATEST(v_cash_gap - v_mixed_recovery_amount, 0);
  v_mixed_new_revenue_protected := CASE
    WHEN v_mixed_gap_after_recovery = 0 THEN 0
    WHEN v_protected_net_cash_pct > 0 THEN v_mixed_gap_after_recovery / v_protected_net_cash_pct
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('mese', TO_CHAR(v_month_start, 'YYYY-MM'), 'dal', v_month_start, 'al', v_month_end),
    'principio_guida', 'Fatturato non significa incasso: una vendita nuova aiuta la cassa solo se l''acconto entra nel periodo e copre almeno i costi variabili iniziali di materiali, posa e fornitori.',
    'ipotesi', jsonb_build_object(
      'margine_su_nuovo_fatturato_pct', ROUND((v_margin * 100)::numeric, 1),
      'costi_variabili_totali_stimati_pct', ROUND((v_variable_cost_total_pct * 100)::numeric, 1),
      'costi_variabili_da_anticipare_stimati_pct', ROUND((v_upfront_variable_pct * 100)::numeric, 1),
      'acconto_standard_pct', ROUND((v_standard_deposit_pct * 100)::numeric, 1),
      'acconto_protetto_suggerito_pct', ROUND((v_protected_deposit_pct * 100)::numeric, 1),
      'nota', 'Le percentuali sono ipotesi prudenziali se non esistono margini/tempi di incasso certificati per le nuove commesse.'
    ),
    'costi_da_coprire', jsonb_build_object(
      'personale_lordo_eur', ROUND(v_payroll_gross::numeric, 2),
      'personale_netto_eur', ROUND(v_payroll_net::numeric, 2),
      'costi_aperti_mese_target_eur', ROUND(v_open_costs_month::numeric, 2),
      'costi_aperti_scaduti_eur', ROUND(v_overdue_costs::numeric, 2),
      'costi_aperti_senza_data_eur', ROUND(v_open_costs_no_date::numeric, 2),
      'totale_da_coprire_eur', ROUND(v_total_to_cover::numeric, 2),
      'dettaglio_costi', v_cost_details
    ),
    'incassi_clienti', jsonb_build_object(
      'rate_scadute_recuperabili_eur', ROUND(v_overdue_receivables::numeric, 2),
      'incassi_previsti_mese_target_eur', ROUND(v_future_receivables::numeric, 2),
      'totale_utilizzabile_eur', ROUND(v_available_receivables::numeric, 2),
      'clienti_scaduti', v_overdue_clients,
      'clienti_previsti_mese', v_future_clients
    ),
    'risultato', jsonb_build_object(
      'gap_cassa_eur', ROUND(v_cash_gap::numeric, 2),
      'fatturato_minimo_teorico_a_margine_eur', ROUND(v_revenue_target_by_margin::numeric, 2),
      'fatturato_da_firmare_con_acconto_standard_eur', ROUND(v_standard_revenue_to_sign::numeric, 2),
      'fatturato_da_firmare_con_acconto_protetto_eur', ROUND(v_protected_revenue_to_sign::numeric, 2),
      'lettura', CASE
        WHEN v_cash_gap = 0 THEN 'Con i dati presenti, incassi previsti e recupero scaduti coprono i costi certificati del periodo.'
        ELSE 'Il numero di fatturato va letto come scenario, non come incasso: serve cassa vera o nuove commesse con acconti sufficienti a coprire i costi variabili iniziali.'
      END
    ),
    'scenari_operativi', jsonb_build_array(
      jsonb_build_object(
        'scenario', 'Recupero crediti scaduti',
        'incasso_da_ottenere_eur', ROUND(v_recovery_required::numeric, 2),
        'fatturato_nuovo_da_generare_eur', 0,
        'priorita', 1,
        'perche', 'Incassa cassa gia maturata e non genera nuovi costi variabili di materiali o posa.'
      ),
      jsonb_build_object(
        'scenario', 'Nuove commesse con acconto standard',
        'acconto_pct', ROUND((v_standard_deposit_pct * 100)::numeric, 1),
        'costi_variabili_da_anticipare_pct', ROUND((v_upfront_variable_pct * 100)::numeric, 1),
        'cassa_libera_per_100_eur_venduto', ROUND((v_standard_net_cash_pct * 100)::numeric, 2),
        'fatturato_da_firmare_eur', ROUND(v_standard_revenue_to_sign::numeric, 2),
        'fattibile', v_standard_net_cash_pct > 0,
        'perche', 'Funziona solo se l''acconto entra subito e resta cassa dopo gli anticipi a fornitori, posa e materiali.'
      ),
      jsonb_build_object(
        'scenario', 'Nuove commesse con acconto protetto',
        'acconto_pct', ROUND((v_protected_deposit_pct * 100)::numeric, 1),
        'costi_variabili_da_anticipare_pct', ROUND((v_upfront_variable_pct * 100)::numeric, 1),
        'cassa_libera_per_100_eur_venduto', ROUND((v_protected_net_cash_pct * 100)::numeric, 2),
        'fatturato_da_firmare_eur', ROUND(v_protected_revenue_to_sign::numeric, 2),
        'priorita', 2,
        'perche', 'Riduce il rischio di usare clienti nuovi per tappare buchi vecchi senza liquidita per eseguire la commessa.'
      ),
      jsonb_build_object(
        'scenario', 'Piano misto prudente',
        'recupero_crediti_ipotizzato_eur', ROUND(v_mixed_recovery_amount::numeric, 2),
        'gap_residuo_eur', ROUND(v_mixed_gap_after_recovery::numeric, 2),
        'fatturato_da_firmare_con_acconto_protetto_eur', ROUND(v_mixed_new_revenue_protected::numeric, 2),
        'priorita', 3,
        'perche', 'Combina sollecito crediti e nuovo venduto protetto, senza basarsi solo su fatturato non ancora incassato.'
      )
    ),
    'azioni_consigliate', jsonb_build_array(
      'Sollecitare subito i clienti scaduti fino a coprire almeno il gap di cassa certificato.',
      'Per nuove commesse, chiedere acconto protetto e non avviare lavori se l''acconto non copre materiali/posa/fornitori iniziali.',
      'Separare nel piano: ordini firmati, incassi attesi, costi variabili da pagare e cassa realmente libera.'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_revenue_needed_next_month(uuid, date, numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_revenue_needed_next_month(uuid, date, numeric) TO service_role;

COMMENT ON FUNCTION public.silvio_tool_revenue_needed_next_month(uuid, date, numeric) IS
  'TOOL Silvio: calcola gap di cassa e scenari operativi distinguendo fatturato, incasso e costi variabili delle nuove commesse.';
