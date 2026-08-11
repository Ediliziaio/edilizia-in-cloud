-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


DO $mig$
DECLARE
  r record;
  nd text;
  cnt int := 0;
  targets text[] := ARRAY[
 'add_email_credits_with_log','add_user_to_order_channel','add_whatsapp_credits_with_log','adjust_credits_atomic','adjust_render_credits_atomic','ai_test_lab_kpi','attach_attribution_to_contact','check_ai_credits_available','check_overdue_and_upcoming_scadenze','check_overdue_scadenze','check_referral_fraud','cleanup_inactive_linked_blocks','complete_onboarding_step','compute_client_margin_history','consume_ai_credits','create_notification','create_oda_from_order','deduct_ai_credits','deduct_ai_credits_with_markup','deduct_email_credits','deduct_email_credits_with_log','email_oauth_upsert_connection','email_search_recipients','enqueue_google_ads_offline_conversion_event','enqueue_meta_crm_conversion_event','execute_automation','get_ai_analytics','get_ai_company_stats','get_attribution_report','get_blocked_orders','get_callcenter_fonte_lead_performance','get_callcenter_kpi_per_operatore','get_callcenter_speed_to_lead_distribuzione','get_callcenter_trend_giornaliero','get_cash_flow_forecast','get_cashflow_summary','get_company_email_quota','get_cruscotto_invoice_stats','get_cruscotto_stats','get_customer_stats','get_customers_paginated','get_dashboard_kpis','get_documenti_counts','get_documenti_monthly_timeline','get_low_stock_alerts','get_marketing_dashboard_stats','get_order_materials_history','get_prezzo_intervento','get_prima_nota_saldo','get_sales_forecast','get_sales_velocity','get_scadenzario_summary','get_stalled_opportunities','get_vendor_funnel_stages','get_vendor_kpi_per_agent','get_vendor_trend_mensile','get_weighted_pipeline','list_company_accountant_invites','log_activity','log_kb_citation','log_referral_event','mark_all_notifications_read','save_internal_automation_nodes','scan_customers_issues','search_company_activity','silvio_ai_usage_stats','silvio_alerts_stats','silvio_brief_promote_alert','silvio_cashflow_forecast_90d','silvio_compute_customer_ltv','silvio_create_alert_with_decision_log','silvio_decision_log_propose','silvio_detect_frodi_anomalie','silvio_employees_workload','silvio_executive_report','silvio_fattura_categorie_summary','silvio_fatture_anomalie_detect','silvio_foto_cantiere_summary','silvio_get_briefing_alerts','silvio_get_memory_context','silvio_match_decision_rule','silvio_ops_health','silvio_payment_delay_pattern','silvio_pricing_history','silvio_team_availability','silvio_tool_apply_capture_review','silvio_tool_apply_complaint_analysis','silvio_tool_apply_computo_review','silvio_tool_apply_visit_debrief_analysis','silvio_tool_blocca_slot_calendario','silvio_tool_cerca_email','silvio_tool_componi_e_invia_messaggio','silvio_tool_compute_prompt_feedback','silvio_tool_convoca_formazione_operaio','silvio_tool_crea_promemoria','silvio_tool_create_capture_run','silvio_tool_create_complaint','silvio_tool_create_visit_debrief','silvio_tool_enqueue_creativita','silvio_tool_genera_documento_router','silvio_tool_get_capture_run','silvio_tool_get_dynamic_pricing_factors','silvio_tool_get_proposal_audit_log','silvio_tool_guida_a','silvio_tool_invia_cedolino','silvio_tool_invia_followup_preventivo','silvio_tool_invia_ordine_fornitore','silvio_tool_invia_sollecito_pagamento','silvio_tool_lancia_winback','silvio_tool_lista_email_thread','silvio_tool_lista_reclami_aperti','silvio_tool_lista_storico_prezzi_griglia','silvio_tool_lista_violazioni_attive','silvio_tool_lista_visite_a_rischio','silvio_tool_lookup_contact_live','silvio_tool_match_product_alias','silvio_tool_optimize_route_nearest_neighbor','silvio_tool_posta_da_lavorare','silvio_tool_quadro_incassi','silvio_tool_record_competitor_signal','silvio_tool_register_camera_device','silvio_tool_register_product_alias','silvio_tool_resolve_complaint','silvio_tool_rispondi_a_email','silvio_tool_salva_regola_decisionale','silvio_tool_save_route_plan','silvio_tool_serie_grafico','silvio_tool_simula_scenario','silvio_tool_top_ai_issues','silvio_top_at_risk_customers','silvio_top_value_customers','silvio_universal_search'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace AND ns.nspname='public'
    JOIN pg_language l ON l.oid = p.prolang AND l.lanname='plpgsql'
    WHERE p.prosecdef
      AND p.proname = ANY(targets)
      AND pg_get_function_arguments(p.oid) ILIKE '%p_company_id%uuid%'
      AND pg_get_functiondef(p.oid) NOT ILIKE '%assert_company_access%'
  LOOP
    nd := regexp_replace(
      r.def,
      '(AS \$function\$.*?)\yBEGIN\y',
      E'\\1BEGIN\n  PERFORM public.assert_company_access(p_company_id);',
      'is'
    );
    IF nd = r.def OR position('assert_company_access(p_company_id)' in nd) = 0 THEN
      RAISE EXCEPTION 'Guard injection FAILED for %', r.proname;
    END IF;
    EXECUTE nd;
    cnt := cnt + 1;
  END LOOP;
  RAISE NOTICE 'Cross-tenant guard iniettato su % funzioni plpgsql', cnt;
END $mig$;
